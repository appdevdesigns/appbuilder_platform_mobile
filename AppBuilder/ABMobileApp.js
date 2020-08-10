/**
 * @class ABMobileApp
 *
 * Is responsible for managing all the routes/data/templates for a given
 * application shown under an appPage.
 *
 * Is an EventEmitter.
 */
"use strict";

//import $ from 'jquery';
import EventEmitter from "eventemitter2";

import Lock from "../resources/Lock.js";

import { Storage, storage } from "../resources/Storage.js";

export default class ABMobileApp extends EventEmitter {
   /**
    * @param {Framework7} app
    * @param {object} [options]
    */
   constructor(app, options = {}) {
      super({
         wildcard: true
      });

      options = options || {};

      this.id = "??";
      this.appPage = null;
      this.routes = null;

      this.status = "bootup";

      this._queueLocks = {}; // a constant reference to available Queue Locks.

      this.datacollections = [];
   }

   init(appPage) {
      // save a reference to the lib/controllers/appPage.js object.
      if (appPage) {
         this.appPage = appPage;
      }

      // Emit a message if init doesn't complete within 25 seconds
      var initTimeout = setTimeout(() => {
         this.emit("init.timeout");
      }, 25 * 1000);

      // 1) load any stored App Markers
      return storage
         .get(this.refMarkers())
         .then((markers) => {
            // default _markers to {} if not found
            this._markers = markers || {};

            // 2) if this app hasn't had a chance to initialize it's data
            return storage.get(this.refStatusKey());
         })
         .then((status) => {
            this.status = status || "initializing";
            this.status = "initializing";
            var pendingOperations = [];

            // if we are initializing our data:
            // request our remote data updates here:
            if (this.status == "initializing") {
               // NOTE: .initializeRemoteData() will update our status
               // to 'ready'
               console.log(
                  this.id + " initializeRemoteDataStatusUpdate() starting"
               );
               pendingOperations.push(
                  this.initializeRemoteDataStatusUpdate().then(() => {
                     console.log(
                        this.id + " initializeRemoteDataStatusUpdate() finished"
                     );
                  })
               );
            }

            //// NOTE: this is designed to .initializeLocalData()
            //// even if we are currently in the 'initializing' state.
            //// So call this each time.
            //// if the data hasn't been loaded from the server yet,
            //// this just returns empty data sets.  But the followup
            //// from the .initializeRemoteData() will populate things
            //// correctly.
            pendingOperations.push(
               this.initializeLocalData().then(() => {
                  console.log(this.id + " local data initialized");
                  // once local data structures are created,
                  // register our listeners.
                  this.registerListeners();
               })
            );

            return Promise.all(pendingOperations)
               .then(() => {
                  clearTimeout(initTimeout);
                  this.emit("dataReady");
               })
               .catch((err) => {
                  clearTimeout(initTimeout);
                  throw err;
               });
         });
   }

   /**
    * initRemote()
    * Perform an init() but don't resolve until all the data from the remote
    * models are returned.
    *
    * @param {lib/platform/pages/appPage} appPage
    *        the live instance of the Application Page Controller that
    *        displays this application.
    * @return {Promise}
    */
   initRemote(appPage) {
      // start the data loading process:
      return this.init(appPage);
   }

   /**
    * initialzieLocalData()
    * intended for child classes to perform any local data initializations.
    * this routine must return a {Promise}
    * @return {Promise}
    */
   initializeLocalData() {
      return Promise.resolve();
   }

   /**
    * initializeRemoteData()
    * intended for child classes to perform any remote data initializations.
    * this routine must return a {Promise}
    * @return {Promise}
    */
   initializeRemoteData() {
      return Promise.resolve();
   }

   /**
    * initializeRemoteDataStatusUpdate()
    * internal routine to call the child's initializeRemoteData() then
    * when it is finished, to update our status properly.
    * @return {Promise}
    */
   initializeRemoteDataStatusUpdate() {
      // perform the exposed initializeRemoteData() operations
      // then update our status to 'ready' when they complete.
      return this.initializeRemoteData().then(() => {
         this.status = "ready";
         this.emit("status");
         return storage.set(this.refStatusKey(), "ready");
      });
   }

   /**
    * registerListeners()
    * intended for child classes to setup any listeners for ABRelay responses
    * that need to be responded to.
    */
   registerListeners() {}

   /**
    * dc()
    * initialize a DataCollection (dc) from a given id.
    *
    * this method() will create an internal property:  .data[fieldName] and
    * a method to access this data:  .get[fieldName]()
    *
    * in addition, an internal reference to the data collection is
    * maintained at dc[fieldName];
    *
    * this method populates the data from the values stored in our
    * local storage.
    *
    * @param {string} id  the uuid of the defined OBJ that contains this data
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    * @return {Promise}
    */
   dc(id, fieldName) {
      var dataRef = this.refDataField(fieldName);
      this[dataRef] = [];

      var methodRef = this.refMethod(fieldName);
      this[methodRef] = function() {
         return this[dataRef];
      };

      var dcRef = this.refDC(fieldName);
      if (!this[dcRef]) {
         var dc = this.dcFind(id);
         if (!dc) {
            console.error(" could not find DataCollection by id[" + id + "]");
            return Promise.reject();
         }
         this[dcRef] = dc;
      }

      return new Promise((resolve, reject) => {
         this[dcRef].model
            .local()
            .findAll()
            .then((dcData) => {
               this[dataRef] = dcData;
               resolve();
            })
            .catch((err) => {
               console.error("::: .dc.loadDataLocal() error:", err);
               reject(err);
            });
      });
   }

   /**
    * dcFind()
    * lookup a DataCollection by a given id.
    * @param {string} id the UUID of the DC to find
    * @return {ABDataCollection} or null if not found.
    */
   dcFind(id) {
      // try to search all pages for the specified data collection id
      // var pages = this.application.pages();
      // var dc = null;
      // pages.forEach((p)=>{
      //     if (!dc) {
      //         dc = p.dataCollections((c) => {
      //                 return c.id == id;
      //             })[0];
      //     }
      // })
      // return dc;
      return this.application.findDC(id);
   }

   /**
    * dcRemote()
    * initiates a request to gather the DataCollection's data from the Server.
    *
    * @param {string} id  the uuid of the DC that contains this data
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    * @return {Promise}
    */
   dcRemote(id, fieldName) {
      var dataRef = this.refDataField(fieldName);
      var emitRef = fieldName + "Updated";
      var dcRef = this.refDC(fieldName);

      if (!this[dcRef]) {
         var dc = this.dcFind(id);
         if (!dc) {
            console.error(" could not find DataCollection by id[" + id + "]");
            return Promise.reject();
         }
         this[dcRef] = dc;
      }

      return new Promise((resolve, reject) => {
         var hasResolved = false;
         var resolveIt = function(data) {
            if (!hasResolved) {
               hasResolved = true;
               resolve(data);
            }
         };

         this[dcRef].platformInit().then(() => {
            return this[dcRef]
               .loadData()
               .catch((err) => {
                  console.error("::: .dcRemote().loadData() error:", err);
                  reject(err);
               })
               .then(() => {
                  if (
                     this[dcRef].dataStatus ==
                     this[dcRef].dataStatusFlag.initialized
                  ) {
                     // #Hack:
                     // patching old platform to work with new:
                     //
                     // data passed into a datacollection will be assigned an
                     // .id by webix if the entry doesn't already have on.
                     // This conflicts with our  original paradigm of needing
                     // to receive the .id back from the server.
                     // BUT webix .id's are really high, so if the given .id
                     // is high, we clear it so we can know we haven't gotten one
                     // from the server:
                     var webixData = this[dcRef].getData();
                     webixData.forEach((d) => {
                        if (d.id) {
                           if (d.id > 100000) {
                              delete d.id;
                           }
                        }
                     });
                     this[dataRef] = webixData;
                     resolveIt(this[dataRef]);
                  }
               }); // kicks off a Relay request
         });

         this[dcRef].removeAllListeners("data"); // prevent multiple
         this[dcRef].on("data", (dcData) => {
            console.log(
               this.id + ":dcRemote:" + dcRef + " received data:",
               dcData
            );
            this[dataRef] = dcData;
            this.emit(emitRef);
            resolveIt(dcData);
         });
      });
   }

   /**
    * lookupData()
    * initialize a special 'lookup' data type. This type is data
    * from a table that is used for list selection type values.
    * --> there are alot of these in HRIS.
    *
    * this fn() will create an internal data:  .data[fieldName] and
    * a method to access this data:  .get[fieldName]()
    *
    * this method populates the data from the values stored in our
    * local storage.
    *
    * @param {string} id  the uuid of the defined OBJ that contains this data
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    * @return {Promise}
    */
   lookupData(id, fieldName) {
      var obj = this.objByID(id);

      var objRef = this.refObj(fieldName);
      if (!this[objRef]) this[objRef] = obj;

      var dataRef = this.refDataField(fieldName);
      this[dataRef] = [];

      var methodRef = this.refMethod(fieldName);
      this[methodRef] = function() {
         return this[dataRef];
      };

      var methodRefreshRef = this.refMethodRefresh(fieldName);
      this[methodRefreshRef] = function() {
         return this.lookupData(id, fieldName);
      };

      return new Promise((resolve, reject) => {
         obj.model()
            .local()
            .findAll()
            .then((listEntries) => {
               this[dataRef] = listEntries || [];
               resolve();
            });
      });
   }

   /**
    * lookupDataRemote()
    * initiates a request to gather the lookup data from the Server.
    *
    * @param {string} id  the uuid of the defined OBJ that contains this data
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    * @return {Promise}
    */
   lookupDataRemote(id, fieldName, shouldOverwriteLocal) {
      return new Promise((resolve, reject) => {
         var obj = this.objByID(id);

         var dataRef = this.refDataField(fieldName);

         // send our Relay request for our data
         obj.model()
            .relay()
            .findAll({ where: {}, populate: false });

         // .relay() doesn't return data immediately.
         // so listen for our 'data' event and respond with that
         obj.on("data", (allEntries) => {
            console.log(
               this.id + ":lookupDataRemote:" + dataRef + " received data:",
               allEntries
            );
            obj.model()
               .local()
               .normalizeData(allEntries);
            this[dataRef] = allEntries || [];

            if (shouldOverwriteLocal) {
               obj.model()
                  .local()
                  .saveLocalData(allEntries)
                  .then(() => {
                     resolve();
                  });
            } else {
               resolve();
            }
         });
      });
   }

   /**
    * objByID()
    * return an ABObject from a given id.
    * @param {string} id
    * @return {ABObject} or {undefined} if not found.
    */
   objByID(id) {
      return this.application.objects((o) => {
         return o.id == id;
      })[0];
   }

   /**
    * Takes an array produced by lookupData() and indexes the data labels
    * according to the primary key. If it has multilingual labels, they will
    * be further indexed by language_code.
    *
    * @param {array} dataArray
    *  [
    *      { <primary_key>, <string label>, ... },
    *      { ... },
    *      ...
    *  ]
    *      OR
    *  [
    *      { <primary_key>, translations: [ ... ], ... },
    *      { ... },
    *      ...
    *  ]
    * @param {string} [primaryKeyField]
    *      Optional. If not specified, the primary key field will be guessed
    *      automatically from fields named "id" or ending in "id".
    * @param {string} [labelField]
    *      Optional. If not specified, the label field will be guessed
    *      automatically from field names ending in "label".
    * @return {object}
    *  {
    *      <primary_key>: <string label>,
    *      ...
    *  }
    *      OR
    *  {
    *      <primary_key>: { <language_code>: <string label>, ... },
    *      ...
    *  }
    */
   indexLookupData(dataArray, primaryKeyField = null, labelField = null) {
      var results = {};

      if (dataArray[0]) {
         // Examine first item for field names
         var item = dataArray[0];
         var fieldNames = Object.keys(item);

         // Best guess at what the primary key field is
         if (!primaryKeyField) {
            if (item.id) {
               // Fieldname is literally "id"
               primaryKeyField = "id";
            } else {
               // First fieldname that ends in "id"
               var keyFields = fieldNames.find((f) => {
                  return f.match(/id$/);
               });
               primaryKeyField = keyFields[0];
            }
         }

         if (!labelField && item.translations && item.translations[0]) {
            // Multilingual labels
            for (var f in item.translations[0]) {
               labelField = f;
               if (f.match(/label$/)) {
                  labelField = f;
                  break;
               }
            }
         } else if (!labelField) {
            // Simple labels
            for (var f in item) {
               labelField = f;
               if (f.match(/label$/)) {
                  labelField = f;
                  break;
               }
            }
         }

         // Convert to indexed array
         dataArray.forEach((item) => {
            var label = item[labelField];

            // For multilingual, index the translations
            if (Array.isArray(item.translations)) {
               label = {};
               item.translations.forEach((trans) => {
                  label[trans.language_code] = trans[labelField];
               });
            }

            results[item[primaryKeyField]] = label;
         });
      }

      return results;
   }

   queueLock(key) {
      if (!this._queueLocks[key]) {
         this._queueLocks[key] = new Lock();
      }
      return this._queueLocks[key];
   }

   /**
    * reset()
    * implements a hard reset on the App.  We reset our status to
    * uninitialized state, and the perform an init()
    * @return {Promise}
    */
   reset() {
      return storage.set(this.refStatusKey(), null).then(() => {
         return this.init();
      });
   }

   /**
    * valueLoad()
    * load a value from local storage.
    *
    * This routine will create a local property for the value as well as
    * an accessor method.
    *
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    */
   valueLoad(fieldName) {
      var dataRef = this.refDataField(fieldName);
      var storageRef = this.refStorageField(fieldName);

      var methodRef = this.refMethod(fieldName);
      this[methodRef] = function() {
         return this[dataRef];
      };

      return storage.get(storageRef).then((value) => {
         this[dataRef] = value;
      });
   }

   /**
    * valueSave()
    * save a value to local storage.
    *
    * If a value is provided, then that value is set to the local property
    * as well as stored in local storage.
    *
    * otherwise, the current property values is saved to local storage.
    *
    * @param {string} fieldName the local field name to reference this data
    *                 by.
    */
   valueSave(fieldName, value) {
      var dataRef = this.refDataField(fieldName);

      // if no value was given, assume a save on the curent value.
      if (typeof value === "undefined") {
         value = this[dataRef];
      }
      this[dataRef] = value;

      var storageRef = this.refStorageField(fieldName);
      return storage.set(storageRef, value);
   }

   refDataField(fieldName) {
      return "data" + fieldName;
   }
   refDC(fieldName) {
      return "dc" + fieldName;
   }
   refMarkers() {
      return this.id + "-Markers";
   }
   refMethod(fieldName) {
      return "get" + fieldName;
   }
   refMethodRefresh(fieldName) {
      return "refresh" + fieldName;
   }
   refObj(fieldName) {
      return "obj" + fieldName;
   }
   refStatusKey() {
      return this.id + "-init-status";
   }
   refStorageField(fieldName) {
      return this.id + "-" + fieldName;
   }

   hasMarker(marker) {
      return Promise.resolve().then(() => {
         if (this._markers[marker]) {
            return true;
         }

         return false;
      });
   }

   setMarker(marker) {
      this._markers[marker] = "1";
      return storage.set(this.refMarkers(), this._markers);
   }

   /**
    * Shortcut for this.$element.find()
    */
   $(pattern) {
      var $element;
      if (this.id) {
         $element = $("#" + this.id);
      } else {
         $element = $(document.body);
      }
      return $element.find(pattern);
   }

   /**
    * pathCSS()
    * return the path to an associated CSS file for this app.
    *
    * used in www/index.js bootup process to add in any application specific
    * css resources.
    *
    * if no css file is present, then return null.
    *
    * @return {string} path to css file:
    */
   pathCSS() {
      return null;
   }
}
