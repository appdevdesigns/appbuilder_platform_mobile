/**
 * ABModelRelay
 *
 * This ABModel performs it's actions using the ABRelay communications
 * channel.
 *
 */

var ABModelCore = require("../core/ABModelCore");

var Network = require("../../resources/Network").default;

module.exports = class ABModelRelay extends ABModelCore {
    constructor(object) {
        super(object);
    }

    /**
     * @method create
     * update model values on the server.
     */
    create(values) {
        this.prepareMultilingualData(values);

        // make sure any values we create have a UUID field set:
        var UUID = this.object.fieldUUID(values);
        if (!values[UUID]) values[UUID] = this.object.application.uuid();

        return Promise.resolve().then(() => {
            // fire off a Relay Request to create this on the server too:
            var params = this.urlParamsCreate(values);
            var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
            responseContext.context.verb = "create";
            return Network.post(params, responseContext).then(() => {
                // a relay doesn't return the data right away so:
                return [];
            });
        });
    }

    /**
     * @method delete
     * remove this model instance from the server
     * @param {integer} id  the .id of the instance to remove.
     * @return {Promise}
     */
    delete(id) {
        return Promise.resolve().then(() => {
            if (id) {
                // fire off a Relay Request to delete this on the server too:
                var params = this.urlParamsDelete(id);
                var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
                responseContext.context.verb = "delete";

                // The data returned from a .delete operation doesn't contain the .id
                // for the item being deleted.  So store it as part of the context
                // and the ABObject will know to use that if it is available.
                responseContext.context.pk = id;

                return Network["delete"](params, responseContext).then(() => {
                    // a relay doesn't return the data right away so:
                    return [];
                });
            } else {
                console.warn(
                    "::: ABModelRelay.delete(): attempting to delete without a valid id:",
                    id
                );
                return Promise.resolve().then(() => {
                    return [];
                });
            }
        });
    }

    /**
     * @method findAll
     * performs a data find with the provided condition.
     */
    findAll(cond) {
        cond = cond || {};

        // this is where the logic will get tricky:
        // As the platform implementation of .findAll()
        // we have to decide if we are storing/retrieving data
        // locally, remotely, or a combination of both.
        //
        // Those settings should be in AB.Policy.*
        // (however Policies aren't implemented at the moment so...)

        return Promise.resolve().then(() => {
            // if we are supposed to be working with remote data:
            // var serviceType = AB.Policy.[someParam]
            // var params = this.urlParamsFind(cond);
            // return AB.Comm[serviceType].get(params, {contextParam})

            // else
            //	return [];

            // for now:
            var params = this.urlParamsFind(cond);
            var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
            responseContext.context.verb =
                responseContext.context.verb || "find";
            return Network.get(params, responseContext).then(() => {
                // a relay doesn't return the data right away so:
                return [];
            });
        });
    }

    /**
     * @method update
     * update model values on the server.
     */
    update(id, values) {
        this.prepareMultilingualData(values);

        // remove empty properties
        for (var key in values) {
            if (values[key] == null) delete values[key];
        }

        return Promise.resolve().then(() => {
            // fire off a Relay Request to update this on the server too:
            var params = this.urlParamsUpdate(id, values);
            var responseContext = this.responseContext; // this.object.application.cloneDeep(this.responseContext);
            responseContext.context.verb = "update";
            return Network.put(params, responseContext).then(() => {
                // a relay doesn't return the data right away so:
                return [];
            });
        });
    }
};
