// ==UserScript==
// @name            csgodouble.com - automated
// @description     An userscript that automates csgodouble.com betting using martingale system.
// @namespace       automated@mole
// @version         1.17
// @author          Mole
// @match           http://www.csgodouble.com/*
// @run-at          document-end
// @grant           none
// ==/UserScript==
/* jshint -W097 */

'use strict';

var debug = false;
var simulation = false;
var stop_on_min_balance = false;
var base_bet = 5;
var default_color = 'red';

var colors = {
    'green': [0],
    'red': [1, 2, 3, 4, 5, 6, 7],
    'black': [8, 9, 10, 11, 12, 13, 14]
};

var balance = document.getElementById('balance');
var roll_history = document.getElementById('past');

var bet_input = document.getElementById('betAmount');

var bet_buttons = {
    'green': document.getElementById('panel0-0').childNodes[1].childNodes[1],
    'red': document.getElementById('panel1-7').childNodes[1].childNodes[1],
    'black': document.getElementById('panel8-14').childNodes[1].childNodes[1]
};

Array.prototype.equals = function (array) {
    if (!array) {
        return false;
    }

    if (this.length != array.length) {
        return false;
    }

    for (var i = 0, l=this.length; i < l; i++) {
        if (this[i] instanceof Array && array[i] instanceof Array) {
            if (!this[i].equals(array[i])) {
                return false;
            }
        } else if (this[i] != array[i]) {
            return false;
        }
    }
    return true;
};

Object.defineProperty(Array.prototype, "equals", {enumerable: false});

function Automated() {
    var self = this;

    this.running = false;
    this.game = null;

    this.debug = debug;
    this.simulation = simulation;
    this.stop_on_min_balance = stop_on_min_balance;

    this.base_bet = base_bet;
    this.default_color = default_color;
    this.old_base = 0;
    this.balance = 0;
    this.last_bet = 0;
    this.min_balance = 0;
    this.starting_balance = 0;
    this.last_color = null;
    this.last_result = null;
    this.history = [];
    this.waiting_for_bet = false;

    this.stats = {
        'wins': 0,
        'loses': 0,
        'balance': 0
    };

    var menu = document.createElement('div');
    menu.innerHTML = '' +
        '<div class="row">' +
            '<div class="col-lg-9">' +
                '<h2>CSGODouble.com Automated <small>by Mole</small></h2>' +
                '<div class="form-group">' +
                    '<div class="btn-group">' +
                        '<button type="button" class="btn btn-success" id="automated-start" disabled>Start</button>' +
                        '<button type="button" class="btn btn-warning" id="automated-stop" disabled>Pause</button>' +
                        '<button type="button" class="btn btn-danger" id="automated-abort" disabled>Abort</button>' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<div class="btn-group">' +
                        '<button type="button" class="btn btn-default" id="automated-red" ' + (this.default_color === 'red' ? 'disabled' : '') + '>Red</button>' +
                        '<button type="button" class="btn btn-default" id="automated-black" ' + (this.default_color === 'black' ? 'disabled' : '') + '>Black</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="col-lg-3">' +
                '<h3>Statistics</h3>' +
                '<p><b>Wins:</b> <span id="automated-stats-wins">' + this.stats.wins + '</span></p>' +
                '<p><b>Loses:</b> <span id="automated-stats-loses">' + this.stats.loses + '</span></p>' +
                '<p><b>Balance:</b> <span id="automated-stats-balance">' + this.stats.balance + '</span></p>' +
            '</div>' +
        '</div>' +
        '<div class="form-group">' +
            '<div class="input-group">' +
                '<div class="input-group-addon">Base value</div>' +
                '<input type="number" class="form-control" placeholder="Calculating suggested value..." id="automated-base-bet" disabled>' +
            '</div>' +
        '</div>' +
        '<div class="form-group">' +
            '<div class="input-group">' +
                '<div class="input-group-addon">Keep balance above</div>' +
                '<input type="number" class="form-control" value="0" id="automated-min-balance">' +
            '</div>' +
        '</div>' +
        '<div class="checkbox">' +
            '<label><input class="" id="automated-stop-on-min-balance" type="checkbox" ' + (this.stop_on_min_balance ? 'checked' : '') + '> Stop on minimal balance (If checked the bot will stop after getting close to minimal balance, otherwise it will continue starting on base)</label>' +
        '</div>' +
        '<div class="checkbox">' +
            '<label><input class="" id="automated-debug" type="checkbox" ' + (this.debug ? 'checked' : '') + '> Debug mode (More details will be displayed in browser console)</label>' +
        '</div>' +
        '<div class="checkbox">' +
            '<label><input id="automated-simulation" type="checkbox" ' + (this.simulation ? 'checked' : '') + '> Simulation mode (The value changes depending on rolls, but no coins are actually placed)</label>' +
        '</div>';
    document.getElementsByClassName('well')[1].appendChild(menu);

    this.menu = {
        'start': document.getElementById('automated-start'),
        'stop': document.getElementById('automated-stop'),
        'abort': document.getElementById('automated-abort'),
        'basebet': document.getElementById('automated-base-bet'),
        'minbalance': document.getElementById('automated-min-balance'),
        'debug': document.getElementById('automated-debug'),
        'simulation': document.getElementById('automated-simulation'),
        'stoponminbalance': document.getElementById('automated-stop-on-min-balance'),
        'red': document.getElementById('automated-red'),
        'black': document.getElementById('automated-black'),
        'statistics': {
            'wins': document.getElementById('automated-stats-wins'),
            'loses': document.getElementById('automated-stats-loses'),
            'balance': document.getElementById('automated-stats-balance')
        }
    };

    this.updater = setInterval(function() { // Update every 5 - 10 seconds
        if (!self.running) {
            if (self.updateAll() && self.menu.stop.disabled && self.menu.start.disabled) {
                self.menu.start.disabled = false;
                if (self.balance > 1000000) {
                    self.base_bet = Math.floor(self.balance / Math.pow(2, 12));
                } else if (self.balance > 100000) {
                    self.base_bet = Math.floor(self.balance / Math.pow(2, 11));
                } else if (self.balance > 10000) {
                    self.base_bet = Math.floor(self.balance / Math.pow(2, 9));
                } else {
                    self.base_bet = Math.floor(self.balance / Math.pow(2, 6));
                }
                self.menu.basebet.value = self.base_bet;
                self.menu.basebet.disabled = false;
                self.starting_balance = self.balance;
            }
        }
    }, (Math.random() * 5 + 5).toFixed(3) * 1000);

    this.menu.start.onclick = function() {
        self.start();
    };

    this.menu.stop.onclick = function() {
        self.stop();
    };

    this.menu.abort.onclick = function() {
        self.abort();
    };

    this.menu.basebet.onchange = function() {
        var value = parseInt(self.menu.basebet.value);
        if (!isNaN(value)) {
            self.base_bet = value;
        }
    };

    this.menu.minbalance.onchange = function() {
        var value = parseInt(self.menu.minbalance.value);
        if (!isNaN(value)) {
            self.min_balance = value;
        }
    };

    this.menu.debug.onchange = function() {
        self.debug = self.menu.debug.checked;
    };

    this.menu.simulation.onchange = function() {
        self.simulation = self.menu.simulation.checked;
    };

    this.menu.stoponminbalance.onchange = function() {
        self.stop_on_min_balance = self.menu.stoponminbalance.checked;
    };

    this.menu.black.onclick = function() {
        self.menu.black.disabled = true;
        self.menu.red.disabled = false;
        self.default_color = 'black';
    };

    this.menu.red.onclick = function() {
        self.menu.black.disabled = false;
        self.menu.red.disabled = true;
        self.default_color = 'red';
    };
}

Automated.prototype.updateBalance = function() {
    this.balance = parseInt(balance.textContent);

    if (isNaN(this.balance)) {
        console.log('[Automated] Error getting current balance!');
        return false;
    }

    if (this.debug) { console.log('[Automated] Balance updated: ' + this.balance); }
    return true;
};

Automated.prototype.updateHistory = function() {
    var self = this;
    this.history = [];

    for (var i = 0; i < roll_history.childNodes.length; i++) {
        var roll = parseInt(roll_history.childNodes[i].textContent);

        if (!isNaN(roll)) {
            if (colors.green.indexOf(roll) !== -1) {
                self.history.push('green');
            } else if (colors.red.indexOf(roll) !== -1) {
                self.history.push('red');
            } else {
                self.history.push('black');
            }
        }
    }

    if (this.debug) { console.log('[Automated] History updated: ' + this.history.map(function(value) { return value; }).join(', ')); }
    return this.history.length === 10;
};

Automated.prototype.updateStats = function() {
    this.menu.statistics.wins.innerHTML = this.stats.wins;
    this.menu.statistics.loses.innerHTML = this.stats.loses;
    this.menu.statistics.balance.innerHTML = this.stats.balance;
    return true;
};

Automated.prototype.updateAll = function() {
    return this.updateBalance() && this.updateHistory() && this.updateStats();
};

Automated.prototype.bet = function(amount, color) {
    var self = this;
    color = color || this.default_color;

    if (['green', 'red', 'black'].indexOf(color) < 0 || amount > this.balance || amount === 0) {
        console.log('[Automated] Invalid bet!');
        this.last_result = 'invalid bet';
        this.stop();
        this.waiting_for_bet = false;
        return false;
    }

    if (this.balance - amount < this.min_balance) {
        console.log('[Automated] Reached minimal balance!');
        this.last_result = 'reached min balance';
        if (this.stop_on_min_balance || this.balance - this.base_bet < this.min_balance) {
            this.stop();
        }
        this.waiting_for_bet = false;
        return false;
    }

    bet_input.value = amount;

    if (!bet_buttons[color].disabled) {
        if (!self.running) {
            if (self.debug) { console.log('[Automated debug] Something went wrong (1)...'); }
            return false;
        }
        var old_balance = self.balance;
        console.log('[Automated] Betting ' + amount + ' on ' + color);
        if (!self.simulation) {
            bet_buttons[color].click();
            var checker = setInterval(function() {
                if (!bet_buttons[color].disabled) {
                    clearInterval(checker);
                    setTimeout(function() {
                        if (self.updateBalance() && self.balance === old_balance) {
                            console.log('[Automated] Bet rejected, retrying...');
                            self.bet(amount, color);
                        } else {
                            if (self.debug) { console.log('[Automated] Bet accepted!'); }
                            self.last_bet = amount;
                            self.last_color = color;
                            self.waiting_for_bet = false;
                            return true;
                        }
                    }, 2500);
                }
            }, 1000);
        }
    } else {
        console.log('[Automated] Button disabled, retrying...');
        setTimeout(function() { self.bet(amount, color) }, (Math.random() * 3 + 2).toFixed(3) * 1000);
    }
};

Automated.prototype.play = function() {
    var self = this;

    if (this.game !== null) {
        if (this.debug) { console.log('[Automated] Tried to reinitialize running game!'); }
        return false;
    }

    this.game = setInterval(function() {
        var history = self.history;
        if (!self.waiting_for_bet && self.updateAll() && !history.equals(self.history)) {
            self.waiting_for_bet = true;
            if (self.last_color === null) {
                self.bet(self.base_bet);
            } else if (self.last_color === self.history[self.history.length - 1]) {
                self.last_result = 'win';
                console.log('[Automated] Win!');
                self.stats.wins += 1;
                self.stats.balance += self.old_base;
                self.old_base = self.base_bet;
                self.bet(self.base_bet);
            } else {
                self.last_result = 'lose';
                console.log('[Automated] Lose!');
                self.stats.loses += 1;
                self.bet(self.last_bet * 2);
            }
        }

    }, (Math.random() * 5 + 5).toFixed(3) * 1000);

    return true;
};

Automated.prototype.start = function() {
    this.old_base = this.base_bet;
    if (this.updateAll()) {
        if (this.last_result === 'lose') {
            this.running = true;
            this.bet(this.last_bet * 2);
            this.play();
        } else {
            this.running = true;
            this.bet(this.base_bet);
            this.play();
        }
    }
    this.menu.abort.disabled = false;
    this.menu.stop.disabled = false;
    this.menu.start.disabled = true;
};

Automated.prototype.stop = function() {
    clearInterval(this.game);
    this.updateAll();
    this.game = null;
    this.running = false;
    this.stats.balance = parseInt(this.balance) - parseInt(this.starting_balance);
    this.menu.abort.disabled = true;
    this.menu.start.disabled = false;
    this.menu.stop.disabled = true;
};

Automated.prototype.abort = function() {
    clearInterval(this.game);
    this.updateAll();
    this.game = null;
    this.running = false;
    this.last_result = 'abort';
    this.stats.balance = parseInt(this.balance) - parseInt(this.starting_balance);
    this.menu.abort.disabled = true;
    this.menu.start.disabled = false;
    this.menu.stop.disabled = true;
};

var automated = new Automated();
