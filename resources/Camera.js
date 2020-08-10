/**
 * @class Camera
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You will probably only need to use getCameraPhoto() and getLibraryPhoto()
 * to get the cdvfile URL. The URL can then be referenced from the DOM such
 * as by <img src='cdvfile://...'> thereafter.
 *
 * Exports a singleton instance.
 */
"use strict";

import CameraPlatform from "./CameraPlatform";
import CameraBrowser from "./CameraBrowser";

var camera = null;

// `navigator.camera` is not available even on the actual device, until
// the 'deviceready' event has fired.
//if (navigator.camera) {

if (window.cordova) {
   camera = new CameraPlatform();
} else {
   camera = new CameraBrowser();
}
export default camera;
