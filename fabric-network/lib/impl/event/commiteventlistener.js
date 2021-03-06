/**
 * Copyright 2019 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const AbstractEventListener = require('./abstracteventlistener');
const logger = require('fabric-network/lib/logger').getLogger('CommitEventListener');
const util = require('util');

/**
 * The Commit Event Listener handles transaction commit events
 *
 * @private
 * @class
 */
class CommitEventListener extends AbstractEventListener {
	/**
	 *
	 * @param {module:fabric-network.Network} network The fabric network
	 * @param {string} transactionId the transaction id being listened to
	 * @param {Function} eventCallback The event callback called when a transaction is committed.
	 * It has signature (err, transactionId, status, blockNumber)
	 * @param {*} options
	 */
	constructor(network, transactionId, eventCallback, options) {
		const listenerName = transactionId + Math.random();
		super(network, listenerName, eventCallback, options);
		this.transactionId = transactionId;
	}

	async register() {
		await super.register();
		if (!this.eventHub) {
			logger.debug('No event hub. Retrieving new one.');
			return await this._registerWithNewEventHub();
		}
		if (this._isAlreadyRegistered(this.eventHub)) { // Prevents a transaction being registered twice with the same event hub
			logger.debug('Event hub already has registrations. Generating new event hub instance.');
			if (!this.options.fixedEventHub) {
				this.eventHub = this.getEventHubManager().getEventHub(this.eventHub._peer, true);
			} else {
				this.eventHub = this.getEventHubManager().getFixedEventHub(this.eventHub._peer);
			}
		}
		const txid = this.eventHub.registerTxEvent(
			this.transactionId,
			this._onEvent.bind(this),
			this._onError.bind(this),
			Object.assign({unregister: true}, this.options)
		);
		this._registration = this.eventHub._transactionRegistrations[txid];
		this.eventHub.connect(!this._filtered);
		this._registered = true;
	}

	unregister() {
		super.unregister();
		if (this.eventHub) {
			this.eventHub.unregisterTxEvent(this.transactionId);
		}
	}

	_onEvent(txid, status, blockNumber) {
		logger.debug('_onEvent:', util.format('success for transaction %s', txid));
		blockNumber = Number(blockNumber);

		try {
			this.eventCallback(null, txid, status, blockNumber);
		} catch (err) {
			logger.debug(util.format('_onEvent error from callback: %s', err));
		}
		if (this._registration.unregister) {
			this.unregister();
		}
	}

	_onError(error) {
		logger.debug('_onError:', util.format('received error from peer %s: %j', this.eventHub.getPeerAddr(), error));
		this.eventCallback(error);
	}


	async _registerWithNewEventHub() {
		if (this.isregistered()) {
			this.unregister();
		}
		if (this.options.fixedEventHub && !this.eventHub) {
			throw new Error(`Cannot use a fixed event hub without setting an event hub ${this.listenerName}`);
		}
		if (!this.options.fixedEventHub) {
			this.eventHub = this.getEventHubManager().getReplayEventHub();
		} else {
			this.eventHub = this.getEventHubManager().getFixedEventHub(this.eventHub._peer);
		}

		this.options.disconnect = true;
		await this.register();
	}

	_isAlreadyRegistered(eventHub) {
		if (!eventHub) {
			throw new Error('Event hub not given');
		}
		const registrations = eventHub._transactionRegistrations;
		if (registrations[this.transactionId]) {
			return true;
		}
		return false;
	}
}

module.exports = CommitEventListener;
