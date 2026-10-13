export interface apiUser {
	id: string;
	orgCode: string;
	policies: string[]; // 'cr_{action}_{scope}'
}

/** A CR status as the UI sees it: a plain string. */
export type apiCrStatus = 
	| 'DRAFT'
	| 'SUBMITTED'
	| 'PENDING_APPROVAL'
	| 'APPROVED'
	| 'APPLIED'
	| 'RETURNED'
	| 'REJECTED'
	| 'CANCELLED';
export interface apiLineItem {
	sku: string;
	description: string;
	quantity: number;
	unitPrice: number;
}
export interface apiTimelineEntry {
	action: string;
	byUserId: string;
	at: string;
	note?: string;
}

/** The parts of a change request the list and detail pages render. */
export interface apiChangeRequest {
	id: string;
	orgCode: string;
	agreementId: string;
	createdBy: string;
	title: string;
	status: apiCrStatus;
	draftChanges: { lineItems?: apiLineItem[] };
	totals: { baselineTotal: number; newTotal: number; delta: number };
	approvals: { userId: string; action: string; at: string }[];
	version: number;
	audit: apiTimelineEntry[];
}

export type apiErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'ILLEGAL_TRANSITION' | 'TERMINAL_STATE' | 'INSUFFICIENT_BUDGET' | 'VALIDATION' | 'NETWORK' | 'UNKNOWN';

/** What a failed client call rejects with: a code the template can branch on and a message it can show. */
export interface apiError {
	code: apiErrorCode;
	message: string;
}
