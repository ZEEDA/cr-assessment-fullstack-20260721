import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrApiClient } from '../../integration/cr-api-client';
import { SessionService } from '../../session/session.service';
import { apiChangeRequest as ChangeRequest, apiError, apiTimelineEntry as TimelineEntry } from '../front.types';
import { idle, loading, ViewState } from '../view-state';
import { canApprovePolicy } from '../permissions';

/**
 * Change Request DETAIL page: loads a CR via the API client and renders its status, totals, timeline,
 * and permission-aware Approve/Reject actions. `load` and the template skeleton are provided; the
 * permission gating and the approve/reject actions are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<ChangeRequest> = idle();
	submitting = false;
	actionError?: string;
	rejectReason = '';

	constructor(private readonly client: CrApiClient, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.client.get(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as apiError).message };
		}
	}

	get detail(): ChangeRequest | null {
		return this.state.data;
	}

	/** Approval history for display (read-only). */
	get timeline(): TimelineEntry[] {
		return this.detail?.audit ?? [];
	}

	onReasonInput(value: string): void {
		this.rejectReason = value;
	}

	// Approve/Reject are only legal while the CR status is PENDING_APPROVAL
	private hasPendingApproval(status: string): boolean {
		return status === 'PENDING_APPROVAL';
	}

	// check whether the current user has approve policy (`cr_a_*`) AND a PENDING_APPROVAL CR status  (respect both status and permission).
	get canApprove(): boolean {
		return canApprovePolicy(this.session.user) && this.hasPendingApproval(this.detail?.status ?? '');
	}

	// check whether the current user has approve policy (`cr_a_*`) AND a PENDING_APPROVAL CR status (respect both status and permission).
	get canReject(): boolean {
		return canApprovePolicy(this.session.user) && this.hasPendingApproval(this.detail?.status ?? '');
	}

	/**
	 * Why Approve/Reject are disabled, shown next to the actions so a user who can't act knows why.
	 * The role is checked first: without an approve policy no status would make the actions available.
	 * Null when the actions are available (or no CR is loaded).
	 */
	get approveRejectActionsUnavailableReason(): string | null {
		if (!this.detail) return null;
		if (!canApprovePolicy(this.session.user)) return "You can view this change request but don't have permission to approve or reject it.";
		if (!this.hasPendingApproval(this.detail.status)) return 'Only change requests pending approval can be approved or rejected.';
		return null;
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		await this.runAction(() => this.client.approve(this.session.user, this.id, new Date().toISOString()));
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;
		const reason = this.rejectReason.trim();
		if (!reason) {
			this.actionError = 'A reason is required to reject this change request.';
			return;
		}
		const ok = await this.runAction(() => this.client.reject(this.session.user, this.id, new Date().toISOString(), reason));
		if (ok) this.rejectReason = '';
	}

	/**
	 * Runs one approve/reject call through the client. 
	 * - While it is in flight `submitting` disables the actions (no double submits on a slow response). 
	 * - On success the CR returned by the service replaces the current one, so (status, totals and timeline) all updated and come from the same response. 
	 * - On failure the last loaded CR stays on screen and the error is shown next to the actions.
	 */
	private async runAction(call: () => Promise<ChangeRequest>): Promise<boolean> {
		const id = this.id;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const updated = await call();
			// Ignore a late response if the user selects a different CR.
			if (id !== this.id) return false;
			this.state = { status: 'loaded', data: updated };
			return true;
		} catch (err) {
			if (id === this.id) this.actionError = (err as apiError).message;
			return false;
		} finally {
			this.submitting = false;
		}
	}
}
