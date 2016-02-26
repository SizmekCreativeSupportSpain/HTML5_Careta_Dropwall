window.addEventListener('load', initFreqCap, false);

function initFreqCap(){
	if (!EB.isInitialized()){
		EB.addEventListener(EBG.EventName.EB_INITIALIZED, startFreqCap);
	}else{
		startFreqCap();
	}
}

function startFreqCap(){
	(function(window) {
		"use strict";

		var EBG = window.EBG;
		var EBGInfra = window.EBGInfra;
		var EB = window.EB;
		var setTimeout = window.setTimeout;
		var clearTimeout = window.clearTimeout;

		EB.autoExpandFrequencyCapping = new AutoExpandFrequencyCapping();

		function AutoExpandFrequencyCapping() {
			var _referenceToThis = this;
			var _settings;
			var _subscriptions = null;
			var _autoCollapseTimeout = null;

			this.Events = {
				AUTO_EXPAND: "autoExpand",
				AUTO_COLLAPSE: "autoCollapse"
			};
			this.EventTiming = {
				BEFORE: "before",
				AFTER: "after"
			};
			this.Frequencies = {
				NEVER: "never",
				SESSION: "session",
				DAY: "day",
				WEEK: "week",
				CAMPAIGN: "campaign",
				UNLIMITED: "unlimited"
			};

			_initializeSubscriptions();

			this.initialize = function(settings) {
				EBG.log.startGroup("Frequency Capping: Initializing");
				_settings = new Settings(settings);

				if (EB.isInitialized()) {
					_determineAutoExpansion();
				}
				else {
					EB.addEventListener(EBG.EventName.EB_INITIALIZED, _determineAutoExpansion, this);
				}

				EBG.log.endGroup();
			};

			this.subscribeToEvent = function(subscription) {
				EBG.log.debug("Frequency Capping: Adding event listener");
				if (subscription.isValid()) {
					if (!_subscriptions.hasOwnProperty(subscription.eventName)) {
						throw (subscription.eventName + " is not a valid event name.");
					}
					if (!subscription.hasOwnProperty("timing") || !_subscriptions[subscription.eventName].hasOwnProperty(subscription.timing)) {
						subscription.timing = this.EventTiming.AFTER;
					}
					_subscriptions[subscription.eventName][subscription.timing].push(subscription);
				}
				else {
					throw ("Subscription " + subscription + " is not valid. Please use 'var mySubscription = new AutoExpandEventSubscription({eventName: 'eventName', callback: myCallbackFunction, callbackBinding: this, timing: 'myTiming');' to create valid events.");
				}
			};

			this.cancelAutoCollapse = function() {
				EBG.log.debug("Frequency Capping: Canceling auto-collapse");
				clearTimeout(_autoCollapseTimeout);
			};

			function _initializeSubscriptions() {
				var events = _referenceToThis.Events;
				var eventTiming = _referenceToThis.EventTiming;

				_subscriptions = {};

				for (var event in events) {
					if (events.hasOwnProperty(event)) {
						var eventSubscriptions = {};
						for (var timing in eventTiming) {
							if (eventTiming.hasOwnProperty(timing)) {
								eventSubscriptions[eventTiming[timing]] = [];
							}
						}

						_subscriptions[events[event]] = eventSubscriptions;
					}
				}
			}

			function _determineAutoExpansion() {
				EBG.log.startGroup("Frequency Capping: Determining auto-expansion");
				try {
					if (_settings.hasRemainingExpansions()) {
						_autoExpand();
					}
					else {
						EBG.log.debug("No remaining auto-expansions.");
					}
				}
				catch (err) {
					EBG.log.error("Aborting auto-expansion: " + err);
				}

				EBG.log.endGroup();
			}

			function _autoExpand() {
				EBG.log.debug("Auto expanding");

				_dispatchEvent(_referenceToThis.Events.AUTO_EXPAND, _referenceToThis.EventTiming.BEFORE);

				_settings.decrementRemainingExpansions();

				EBG.log.endGroup();
			}

			function _autoCollapse() {
				EBG.log.startGroup("Frequency Capping: Auto collapsing");

				_dispatchEvent(_referenceToThis.Events.AUTO_COLLAPSE, _referenceToThis.EventTiming.BEFORE);
				EB.collapse();
				_dispatchEvent(_referenceToThis.Events.AUTO_COLLAPSE, _referenceToThis.EventTiming.AFTER);

				EBG.log.endGroup();
			}

			function _dispatchEvent(eventName, eventTiming) {
				if (_subscriptions.hasOwnProperty(eventName)) {
					if (_subscriptions[eventName].hasOwnProperty(eventTiming)) {
						var subscribers = _subscriptions[eventName][eventTiming];

						for (var i = 0; i < subscribers.length; i++) {
							subscribers[i].callback.apply(subscribers[i].callbackBinding);
						}
					}
					else {
						throw(eventTiming + " is not a valid event timing.");
					}
				}
				else {
					throw (eventName + " is not a valid event name.");
				}
			}

			EBG.log.endGroup();


			function Settings(settings) {
				var _isEnabled = false;
				var _frequency = EB.autoExpandFrequencyCapping.Frequencies.NEVER;
				var _expansionsPerPeriod = 0;
				var _durationInMilliseconds = -1;
				var _storage;
				var _storageKeys;
				var MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
				var _timePeriods = {
					DAY: MILLISECONDS_PER_DAY,
					WEEK: MILLISECONDS_PER_DAY * 7
				};

				_setIsEnabled(settings.isEnabled);

				if (_getIsEnabled()) {
					_setFrequency(settings.frequency);

					if (_isFrequencyUnlimited()) {
						_setExpansionsPerPeriod(Number.POSITIVE_INFINITY);
					}
					else if (!_isFrequencyNever()) {
						_setExpansionsPerPeriod(settings.expansionsPerPeriod);
						_resetRemainingExpansionsIfNewPeriod();
					}

					_updateStoredSettingsIfChanged();
				}

				this.hasRemainingExpansions = function() {
					if (_isFrequencyUnlimited()) {
						return true;
					}
					else if (!_isFrequencyNever()){
						var remainingExpansions = _getStorage().getRemainingExpansions();

						if (_isNonNegativeInteger(remainingExpansions) && remainingExpansions > 0) {
							return true;
						}
					}

					return false;
				};

				this.decrementRemainingExpansions = function() {
					EBG.log.debug("Decrementing stored remaining expansions");

					if (!_isFrequencyUnlimited() && !_isFrequencyNever()) {
						var remainingExpansions = _getStorage().getRemainingExpansions();

						if (_isNonNegativeInteger(remainingExpansions) && remainingExpansions > 0) {
							remainingExpansions--;
							_getStorage().setRemainingExpansions(remainingExpansions);
						}
						else {
							EBG.log.debug("Unable to decrement 'remainingExpansions' from value of {0}. Can only decrement an integer greater than or equal to 0.", remainingExpansions);
						}
					}
					else {
						EBG.log.debug("Unable to decrement, frequency is unlimited.");
					}
				};

				this.hasTimeUntilAutoCollapse = function() {
					return settings.hasOwnProperty("timeUntilAutoCollapse") && _isNonNegativeInteger(settings.timeUntilAutoCollapse);
				};

				this.getTimeUntilAutoCollapse = function() {
					return settings.timeUntilAutoCollapse;
				};

				function _setIsEnabled(isEnabled) {
					EBG.log.debug ("Set isEnabled to: " + isEnabled);

					if (EBGInfra.isBool(isEnabled)) {
						_isEnabled = isEnabled;
					}
					else {
						throw (isEnabled + " is not a valid value for 'isEnabled'. Please set it to a Boolean true or false.");
					}
				}

				function _getIsEnabled() {
					return _isEnabled;
				}

				function _setFrequency(frequency) {
					EBG.log.debug("Setting frequency to: " + frequency);

					if (_isValidFrequency(frequency)) {
						_frequency = frequency;
					}
					else{
						var availablefrequencyConstants = "";

						for (var prop in EB.autoExpandFrequencyCapping.Frequencies) {
							availablefrequencyConstants += prop + ", ";
						}

						var lastCommaIndex = availablefrequencyConstants.lastIndexOf(",");
						availablefrequencyConstants = availablefrequencyConstants.substring(0, lastCommaIndex);

						throw (frequency + " is not a valid value for 'frequency'. Please set it to one of the following values: " + availablefrequencyConstants);
					}
				}

				function _isValidFrequency(frequency) {
					for (var prop in EB.autoExpandFrequencyCapping.Frequencies) {
						if (frequency === EB.autoExpandFrequencyCapping.Frequencies[prop]) {
							return true;
						}
					}

					return false;
				}

				function _getFrequency() {
					return _frequency;
				}

				function _isFrequencyUnlimited() {
					return _getFrequency() === EB.autoExpandFrequencyCapping.Frequencies.UNLIMITED;
				}

				function _isFrequencyNever() {
					return _getFrequency() === EB.autoExpandFrequencyCapping.Frequencies.NEVER;
				}

				function _setExpansionsPerPeriod(expansionsPerPeriod) {
					EBG.log.debug("Setting expansions per period to: " + expansionsPerPeriod);

					if (_isValidExpansionsPerPeriod(expansionsPerPeriod)) {
						_expansionsPerPeriod = Number(expansionsPerPeriod);
					}
					else {
						throw (expansionsPerPeriod + " is not a valid value for 'expansionsPerPeriod'. Please set it to an integer greater than or equal to 0, or Number.POSITIVE_INFINITY.");
					}
				}

				function _getExpansionsPerPeriod() {
					return _expansionsPerPeriod;
				}

				function _isValidExpansionsPerPeriod(expansionsPerPeriod) {
					var isPositiveInfinity = expansionsPerPeriod === Number.POSITIVE_INFINITY;

					return _isNonNegativeInteger(expansionsPerPeriod) || isPositiveInfinity;
				}

				function _isNonNegativeInteger(value) {
					var nonNegativeIntegerPattern = /^\d+$/;
					return nonNegativeIntegerPattern.test(value);
				}

				function _getStorage() {
					if (!_storage) {
						_storage = new Storage(_getFrequency());
					}

					return _storage;
				}

				function _updateStoredSettingsIfChanged() {
					EBG.log.debug("Updating stored settings if changed");
					if (_didSettingsChange()) {
						_updateStoredSettings();
					}
				}

				function _didSettingsChange() {
					if ((_isFrequencyUnlimited() || _isFrequencyNever()) && _didFrequencyChange()) {
						return true;
					}
					else if (_didFrequencyChange() || _didExpansionsPerPeriodChange()) {
						return true;
					}
					else {
						return false;
					}
				}

				function _didFrequencyChange() {
					return _getFrequency() !== _getStorage().getFrequency();
				}

				function _didExpansionsPerPeriodChange() {
					return _getExpansionsPerPeriod() !== _storage.getExpansionsPerPeriod();
				}

				function _updateStoredSettings() {
					EBG.log.debug("Updating stored settings");
					_storage.setFrequency(_getFrequency());

					if (!_isFrequencyUnlimited() && !_isFrequencyNever()) {
						_storage.setExpansionsPerPeriod(_getExpansionsPerPeriod());
						_storage.setRemainingExpansions(_getExpansionsPerPeriod());
						_storage.resetPeriodStartTime();
					}
				}

				function _resetRemainingExpansionsIfNewPeriod() {
					EBG.log.debug("Resetting remaining expansions if new period");

					if (_isPreviousPeriodOver()) {
						EBG.log.debug("Previous period is over");
						_storage.resetPeriodStartTime();
						_storage.setRemainingExpansions(_getExpansionsPerPeriod());
					}
					else {
						EBG.log.debug("Previous period is not over");
					}
				}

				function _isPreviousPeriodOver() {
					var currentDate = new Date();
					var currentTime = currentDate.getTime();
					var timeSincePeriodBegan = currentTime - _getStorage().getPeriodStartTime();
					var frequency = _getFrequency();
					var isPreviousPeriodOver;

					switch (frequency) {
						case EB.autoExpandFrequencyCapping.Frequencies.DAY:
							isPreviousPeriodOver = (timeSincePeriodBegan > _timePeriods.DAY);
							break;
						case EB.autoExpandFrequencyCapping.Frequencies.WEEK:
							isPreviousPeriodOver = (timeSincePeriodBegan > _timePeriods.WEEK);
							break;
						default:
							isPreviousPeriodOver = false;
							break;
					}

					return isPreviousPeriodOver;
				}
			}

			function Storage(type) {
				var _storage;
				var _storageKeys;

				_setStorageType(type);
				_initializeStorageKeys();

				function _setStorageType(type) {
					EBG.log.debug("Setting storage type");
					if (type === EB.autoExpandFrequencyCapping.Frequencies.SESSION && EB.browserSupports("sessionStorage")) {
						_storage = window.sessionStorage;
					}
					else if (EB.browserSupports("localStorage")) {
						_storage = window.localStorage;
					}
					else {
						throw ("Browser does not support storage. Cannot store frequency capping settings.");
					}
				}

				function _initializeStorageKeys() {
					EBG.log.debug("Initializing storage keys");

					var adId = EB._adConfig ? EB._adConfig.adId : "LocalTest";

					_storageKeys = {
						FREQUENCY: adId + "_frequency",
						EXPANSIONS_PER_PERIOD: adId + "_expansionsPerPeriod",
						REMAINING_EXPANSIONS: adId + "_remainingExpansions",
						PERIOD_START_TIME: adId + "_periodStartTime"
					};
				}

				function _getStorage() {
					return _storage;
				}

				this.setFrequency = function(frequency) {
					EBG.log.debug("Setting stored frequency: " + frequency);
					_getStorage().setItem(_storageKeys.FREQUENCY, frequency);
				};

				this.getFrequency = function() {
					return _getStorage().getItem(_storageKeys.FREQUENCY);
				};

				this.setExpansionsPerPeriod = function(expansionsPerPeriod) {
					EBG.log.debug("Setting stored expansions per period: " + expansionsPerPeriod);
					_getStorage().setItem(_storageKeys.EXPANSIONS_PER_PERIOD, expansionsPerPeriod);
				};

				this.getExpansionsPerPeriod = function() {
					return Number(_getStorage().getItem(_storageKeys.EXPANSIONS_PER_PERIOD));
				};

				this.setRemainingExpansions = function(remainingExpansions) {
					EBG.log.debug ("Setting stored remaining expansions to: " + remainingExpansions);

					_getStorage().setItem(_storageKeys.REMAINING_EXPANSIONS, remainingExpansions);
				};

				this.getRemainingExpansions = function() {
					return Number(_getStorage().getItem(_storageKeys.REMAINING_EXPANSIONS));
				};

				this.resetPeriodStartTime = function() {
					EBG.log.debug("Resetting period start time");
					var currentDate = new Date();
					var currentTime = currentDate.getTime();

					_getStorage().setItem(_storageKeys.PERIOD_START_TIME, currentTime);
				};

				this.getPeriodStartTime = function() {
					return _getStorage().getItem(_storageKeys.PERIOD_START_TIME);
				};
			}

			this.EventSubscription = function(subscription) {
				EBG.callSuperConstructor(EB.autoExpandFrequencyCapping.EventSubscription, this, [subscription.eventName, subscription.callback, subscription.callbackBinding]);
				this.timing = subscription.timing;
			};

			EBG.declareClass(this.EventSubscription, EBG.EventSubscription);

		}
	})(window);
}