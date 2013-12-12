var _ = require('underscore'),
    Storage = module.exports = function(config) {
    this.config = config;
    this.debug = false;
};

Storage.prototype = {
    log: function (str) {
        if (this.debug) {
            console.info(str);
        }
    }
};

Storage.factory = function(type, config) {
    var storage;
    switch (type.toLowerCase()) {
        case 'local':
            storage = require('./storage.local')(Storage);
            break;
        case 's3':
            storage = require('./storage.s3')(Storage);
            break;
        case 'rackspace':
            storage = require('./storage.rackspace')(Storage);
            break;
        default:
            throw new Error('Unkown storage type');
    }
    return new storage(config);
};

Storage.extend = function(proto) {
    var parent = this,
        child = function(){ return parent.apply(this, arguments); };
    var protoCreator = function(){ this.constructor = child; };
    protoCreator.prototype = parent.prototype;
    child.prototype = Object.create(protoCreator.prototype);
    if (proto) _.extend(child.prototype, proto);
    return child;
};