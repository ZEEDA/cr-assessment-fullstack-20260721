import { Injectable } from '@angular/core';
import { ChangeRequest, ReqUser } from '../backend/cr.types';
import { CrService } from '../backend/cr-service';
import { CrRepo } from '../backend/cr-repo';
import { BusinessError, BusinessErrorCode, Errors } from '../backend/errors';
import { buildSeed } from '../backend/seed';

/** What every failed call rejects with: the backend error code (or NETWORK/UNKNOWN) and a message the UI can show. */
type CrApiError = { code: BusinessErrorCode | 'NETWORK' | 'UNKNOWN'; message: string };

/**
 * The API/UI boundary. The Angular UI talks to this async client; the client calls the in-process
 * backend `CrService` (built over the seeded repo). This stands in for an HTTP layer — same contract,
 * no network. Every failure rejects with a plain `CrApiError` (code + message), never a backend exception.
 *
 * `latencyMs`/`failNext` let the UI exercise loading and error handling.
 */
@Injectable({ providedIn: 'root' })
export class CrApiClient {
	latencyMs = 0;
	failNext = false;
	private readonly service: CrService;
	private readonly users: Record<string, ReqUser>;

	constructor() {
		const seed = buildSeed();
		const repo = new CrRepo();
		repo.seed(seed.changeRequests);
		this.service = new CrService(repo, seed.agreements, seed.budgets);
		this.users = seed.users;
	}

	private settle<T>(produce: () => T): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			setTimeout(() => {
				if (this.failNext) {
					this.failNext = false;
					const networkError: CrApiError = { code: 'NETWORK', message: 'Network error' };
					reject(networkError);
					return;
				}
				try {
					resolve(produce());
				} catch (err) {
					reject(toApiError(err));
				}
			}, this.latencyMs);
		});
	}

	/**
	 * The seeded demo users, keyed by name (e.g. `viewer`), for the app shell's "Acting as" switcher.
	 * Rejects with a message the UI can show as-is when there are no users or a user is incomplete
	 * (an incomplete user would break the permission checks later on).
	 */
	listUsers(): Promise<Record<string, ReqUser>> {
		return this.settle(() => {
			const users = this.users ?? {};
			if (Object.keys(users).length === 0) throw Errors.notFound('No users are available to act as.');

			const incomplete = Object.keys(users).filter((key) => !isCompleteUser(users[key]));
			if (incomplete.length) throw Errors.validation(`Some users are missing an id, org or policies: ${incomplete.join(', ')}.`);

			return users;
		});
	}

	list(user: ReqUser): Promise<ChangeRequest[]> {
		return this.settle(() => this.service.list(user));
	}
	get(user: ReqUser, id: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.get(user, id));
	}
	approve(user: ReqUser, id: string, at: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.approve(user, id, at));
	}
	reject(user: ReqUser, id: string, at: string, note: string): Promise<ChangeRequest> {
		return this.settle(() => this.service.reject(user, id, at, note));
	}
}

function isCompleteUser(user: ReqUser | undefined): boolean {
	return !!user?.id && !!user.orgCode && Array.isArray(user.policies);
}

/**
 * Turns whatever the backend threw into a plain `CrApiError`, so no backend exception reaches the UI.
 * Business errors keep their code and message (the service's messages are written to be shown); anything
 * else is unexpected, so its details are replaced by a generic message.
 */
function toApiError(err: unknown): CrApiError {
	if (err instanceof BusinessError) return { code: err.code, message: err.message };
	return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}
