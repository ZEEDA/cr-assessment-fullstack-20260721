import { CrApiClient } from './cr-api-client';
import { users } from '../backend/seed';
import { ReqUser } from '../backend/cr.types';
import { CrStatus } from '../backend/cr.enums';
import { T } from '../test-helpers';

describe('CrApiClient (the seam)', () => {
	let client: CrApiClient;

	beforeEach(() => {
		client = new CrApiClient();
	});

	it('approves through the service, and the change is visible on the next read', async () => {
		const approved = await client.approve(users.mona, 'CR-2', T);

		expect(approved.status).toBe(CrStatus.APPROVED);
		expect((await client.get(users.mona, 'CR-2')).status).toBe(CrStatus.APPROVED);
	});

	it('rejects through the service with the reason, and the change is visible on the next read', async () => {
		const rejected = await client.reject(users.mona, 'CR-2', T, '  Over budget  ');

		expect(rejected.status).toBe(CrStatus.REJECTED);
		expect(rejected.audit[rejected.audit.length - 1]).toEqual({ action: 'REJECT', byUserId: 'mona', at: T, note: 'Over budget' });
		expect((await client.get(users.mona, 'CR-2')).status).toBe(CrStatus.REJECTED);
	});

	describe('turns every failure into a plain { code, message }', () => {
		it('a business error keeps its code and the service message, but is not the backend exception', async () => {
			const call = client.approve(users.viewer, 'CR-2', T);

			await expect(call).rejects.toEqual({ code: 'FORBIDDEN', message: 'Cannot approve' });
			await expect(call).rejects.not.toBeInstanceOf(Error);
		});

		it.each([
			{
				what: 'an illegal transition',
				call: (c: CrApiClient) => c.approve(users.mona, 'CR-1', T),
				code: 'ILLEGAL_TRANSITION',
				message: 'Transition DRAFT -> APPROVED is not allowed',
			},
			{
				what: 'a terminal CR',
				call: (c: CrApiClient) => c.approve(users.mona, 'CR-APPLIED', T),
				code: 'TERMINAL_STATE',
				message: 'Cannot move a APPLIED change request to APPROVED',
			},
			{
				what: 'a CR from another org',
				call: (c: CrApiClient) => c.get(users.bob, 'CR-2'),
				code: 'NOT_FOUND',
				message: 'CR CR-2 not found',
			},
			{
				what: 'a reject without a reason',
				call: (c: CrApiClient) => c.reject(users.mona, 'CR-2', T, ' '),
				code: 'VALIDATION',
				message: 'A reason is required to reject a change request',
			},
		])('$what -> $code', async ({ call, code, message }) => {
			await expect(call(client)).rejects.toEqual({ code, message });
		});

		it('a network failure rejects with NETWORK without running the action, and only fails one call', async () => {
			client.failNext = true;

			await expect(client.approve(users.mona, 'CR-2', T)).rejects.toEqual({ code: 'NETWORK', message: 'Network error' });
			expect((await client.get(users.mona, 'CR-2')).status).toBe(CrStatus.PENDING_APPROVAL);
		});

		it('an unexpected error becomes UNKNOWN with a generic message, hiding its details', async () => {
			const broken = { id: 'x', orgCode: 'org-alpha' } as ReqUser; // no policies: the permission check throws a TypeError

			await expect(client.approve(broken, 'CR-2', T)).rejects.toEqual({
				code: 'UNKNOWN',
				message: 'Something went wrong. Please try again.',
			});
		});
	});

	describe('listUsers', () => {
		it('returns the seeded users keyed by name', async () => {
			expect(Object.keys(await client.listUsers())).toEqual(['alice', 'mona', 'viewer', 'bob']);
		});

		// The users are the client's private seed data; replace them to exercise its checks.
		it('rejects with NOT_FOUND when there are no users', async () => {
			(client as any).users = {};

			await expect(client.listUsers()).rejects.toEqual({ code: 'NOT_FOUND', message: 'No users are available to act as.' });
		});

		it('rejects with VALIDATION naming an incomplete user', async () => {
			(client as any).users = { ...users, ghost: { id: 'ghost', orgCode: 'org-alpha' } };

			await expect(client.listUsers()).rejects.toEqual({
				code: 'VALIDATION',
				message: 'Some users are missing an id, org or policies: ghost.',
			});
		});

		it('rejects with NETWORK on a network failure', async () => {
			client.failNext = true;

			await expect(client.listUsers()).rejects.toEqual({ code: 'NETWORK', message: 'Network error' });
		});
	});
});
