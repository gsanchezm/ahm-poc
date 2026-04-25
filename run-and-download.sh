#!/bin/bash
# =============================================================================
# AHM Thesis - Sequence Runner & Artifact Downloader
# Ejecuta N ciclos por cada plataforma, espera a que terminen y descarga
# los artifacts generados antes de pasar a la siguiente tecnología.
# =============================================================================

set -euo pipefail

CYCLES="${CYCLES:-200}"
WORKFLOW="AHM — Execution Helix"
PLATFORMS=("web" "perf" "android" "ios")

# Crear el directorio base para los artifacts
mkdir -p "ahm_artifacts"

for PLATFORM in "${PLATFORMS[@]}"; do
  echo "========================================================="
  echo "🚀 Iniciando $CYCLES ciclos para la plataforma: $PLATFORM"
  echo "========================================================="
  
  # 1. Ejecutar los ciclos llamando a tu script existente
  PLATFORM="$PLATFORM" CYCLES="$CYCLES" ./generate-ahm-data.sh

  echo "⏳ Esperando a que los runners de GitHub procesen todos los jobs de $PLATFORM..."
  
  # 2. Polling: Esperar hasta que no haya ejecuciones pendientes o en progreso
  while true; do
    # Obtenemos la cantidad de jobs en progreso y en cola para este workflow
    IN_PROGRESS=$(gh run list --workflow "$WORKFLOW" --status in_progress --json databaseId -q 'length')
    QUEUED=$(gh run list --workflow "$WORKFLOW" --status queued --json databaseId -q 'length')
    
    TOTAL_PENDING=$((IN_PROGRESS + QUEUED))
    
    if [ "$TOTAL_PENDING" -eq 0 ]; then
      echo "✅ ¡Todas las ejecuciones de $PLATFORM han finalizado!"
      break
    else
      echo "   Aún hay $TOTAL_PENDING ejecuciones en proceso/cola. Revisando de nuevo en 30 segundos..."
      sleep 30
    fi
  done

  echo "📥 Descargando los artifacts generados para $PLATFORM..."
  
  # 3. Obtener los IDs de las ejecuciones que acabamos de terminar
  # Usamos el límite exacto de ciclos que mandamos a ejecutar
  RUN_IDS=$(gh run list --workflow "$WORKFLOW" --limit "$CYCLES" --json databaseId -q '.[].databaseId')
  
  PLATFORM_DIR="ahm_artifacts/$PLATFORM"
  mkdir -p "$PLATFORM_DIR"
  
  for RUN_ID in $RUN_IDS; do
    echo "   Descargando artifacts del run ID: $RUN_ID..."
    # Se descargan en una subcarpeta con el run_id para evitar sobreescritura de nombres de archivos
    gh run download "$RUN_ID" --dir "$PLATFORM_DIR/$RUN_ID" || echo "   ⚠️ No hay artifacts disponibles para el run $RUN_ID"
  done
  
  echo "🎉 Ciclo de $PLATFORM completado. Artifacts guardados en ./$PLATFORM_DIR/"
  echo "---------------------------------------------------------"
  
  # Una pequeña pausa antes de saturar a GitHub con la siguiente plataforma
  sleep 10
done

echo "🏆 ¡Todo el proceso de generación de datos AHM y descarga de artifacts ha finalizado exitosamente!"
