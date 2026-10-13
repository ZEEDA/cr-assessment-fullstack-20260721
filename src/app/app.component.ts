import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrListComponent } from '../frontend/cr-list/cr-list.component';
import { CrDetailComponent } from '../frontend/cr-detail/cr-detail.component';
import { SessionService } from '../session/session.service';
import { CrApiClient } from '../integration/cr-api-client';
import { apiError, apiUser as ReqUser } from '../frontend/front.types';
import { idle, loading, ViewState } from '../frontend/view-state';

/** Who the app acts as once the users are loaded (an approver, so the actions are live). */
const DEFAULT_USER_KEY = 'mona';

/**
 * Demo app shell that hosts the list + detail screens so you can click through the full UI->client->
 * service flow in a browser (run `npm start`). The whole stack runs in-process — the `CrApiClient`
 * calls the in-memory backend service directly, no server needed.
 *
 * The "Acting as" switcher changes the current user and reloads both panes — handy for demoing
 * permission-aware action states in your walkthrough video.
 */
@Component({
	selector: 'app-root',
	standalone: true,
	imports: [CommonModule, CrListComponent, CrDetailComponent],
	templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
	usersState: ViewState<Record<string, ReqUser>> = idle();
	selectedId: string | null = 'CR-2';
	show = true;

	constructor(public readonly session: SessionService, private readonly client: CrApiClient) {}

	ngOnInit(): void {
		void this.loadUsers();
	}

	/** Loads the "Acting as" users through the API client; the panes render once a user is set. */
	async loadUsers(): Promise<void> {
		this.usersState = loading();
		try {
			const users = await this.client.listUsers();
			this.usersState = { status: 'loaded', data: users };
			this.session.user ??= users[DEFAULT_USER_KEY];
		} catch (err) {
			this.usersState = { status: 'error', data: null, error: (err as apiError).message };
		}
	}

	get users(): Record<string, ReqUser> {
		return this.usersState.data ?? {};
	}

	get userKeys(): string[] {
		return Object.keys(this.users);
	}

	switchUser(key: string): void {
		this.session.user = this.users[key];
		// Drop the open CR: the new user may not be able to see it (e.g. another org) and should pick from their own list.
		this.selectedId = null;
		this.reload();
	}

	onSelect(id: string): void {
		this.selectedId = null;
		setTimeout(() => {this.selectedId = id;}, 0);
	}

	private reload(): void {
		this.show = false;
		setTimeout(() => (this.show = true));
	}
}
