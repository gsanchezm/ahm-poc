#!/bin/bash
# =============================================================================
# AHM Thesis - Stochastic Data Generator
# Queues N executions of the DAG Helix to generate Markov Chain telemetry
# =============================================================================

set -euo pipefail

CYCLES="${CYCLES:-50}"
PLATFORM="${PLATFORM:-android}" # Options: all, web, android, ios, perf
REF="${REF:-main}"
WORKFLOW="${WORKFLOW:-AHM — Execution Helix}"
ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-33}"
PERF_PROFILE="${PERF_PROFILE:-smoke}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"

echo "Initiating AHM Data Generation..."
echo "Target Platform: $PLATFORM"
echo "Git Ref: $REF"
echo "Requested Cycles: $CYCLES"
if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo "Android API Level: $ANDROID_API_LEVEL"
fi
echo "------------------------------------------------"

for ((i=1; i<=CYCLES; i++))
do
  echo "Queuing Execution Helix #$i..."

  args=(
    workflow
    run
    "$WORKFLOW"
    --ref "$REF"
    -f "platform=$PLATFORM"
  )

  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    args+=(-f "android_api_level=$ANDROID_API_LEVEL")
  fi

  if [[ "$PLATFORM" == "perf" || "$PLATFORM" == "all" ]]; then
    args+=(-f "perf_profile=$PERF_PROFILE")
  fi

  # Trigger the GitHub Action via API.
  gh "${args[@]}"
  
  # 5-second buffer to prevent hitting GitHub's API rate limits
  sleep "$SLEEP_SECONDS"
done

echo "------------------------------------------------"
echo "Successfully queued $CYCLES cycles to the DAG Hypervisor!"
echo "Monitor progress at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions"
