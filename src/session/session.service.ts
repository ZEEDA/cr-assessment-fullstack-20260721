import { Injectable } from '@angular/core';
import { apiUser as ReqUser } from '../frontend/front.types';

/**
 * Holds the current signed-in user. Components read `user` to decide which actions to offer.
 * Stands in for auth: the app shell sets `user` once it has loaded the users through the API client.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
	user: ReqUser | null = null;
}
