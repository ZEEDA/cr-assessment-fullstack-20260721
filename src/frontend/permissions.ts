import { ReqUser } from '../backend/cr.types';

export function hasPolicy(user: ReqUser, policy: string): boolean {
	return !!user && user.policies.includes(policy);
}

export function canApprovePolicy(user: ReqUser): boolean {
	// check whether the current user only has read access.
	if (isReadOnlyPolicy(user)) return false;
	return ['cr_a_u', 'cr_a_w', 'cr_a_o'].some((p) => hasPolicy(user, p));
}

/** True when the user holds only read policies (`cr_r_*`) and no action policies. */
function isReadOnlyPolicy(user: ReqUser): boolean {
	return !!user && user.policies.every((p) => p.startsWith('cr_r_'));
}
