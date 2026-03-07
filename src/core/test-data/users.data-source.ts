import { readFile } from 'fs/promises';
import * as path from 'path';

export interface UserRecord {
    username: string;
    password: string;
    behavior?: string;
    email?: string;
}

type UsersByAlias = Record<string, UserRecord[]>;

const DEFAULT_USERS_FILE_PATH = path.resolve(__dirname, 'users.json');

export class UsersDataSource {
    private readonly filePath: string;
    private usersCache: UsersByAlias | null = null;

    constructor(filePath: string = DEFAULT_USERS_FILE_PATH) {
        this.filePath = filePath;
    }

    async getUser(alias: string): Promise<UserRecord> {
        const usersByAlias = await this.loadAll();
        const users = usersByAlias[alias];

        if (!users || users.length === 0) {
            throw new Error(`User alias "${alias}" was not found in users data source`);
        }

        return users[0];
    }

    private async loadAll(): Promise<UsersByAlias> {
        if (this.usersCache) {
            return this.usersCache;
        }

        const raw = await readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as UsersByAlias;
        this.usersCache = parsed;
        return parsed;
    }
}
