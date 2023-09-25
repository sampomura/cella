import WebGL from 'three/addons/capabilities/WebGL.js';
import {
    Viewer
}
from './viewer.js';
//import { Validator } from './validator.js';

window.VIEWER = {};

if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
    console.error('The File APIs are not fully supported in this browser.');
} else if (!WebGL.isWebGLAvailable()) {
    console.error('WebGL is not supported in this browser.');
}

class App {

    /**
     * @param  {Element} el
     * @param  {Location} location
     */
    constructor(el, location) {

        this.options = {
            kiosk: false,
            model: "public/Model.gltf",
            preset: '',
            cameraPosition: null
        };

        this.el = el;
        this.viewer = null;
        this.viewerEl = null;
        this.spinnerEl = el.querySelector('.spinner');
        this.dropEl = el.querySelector('.dropzone');
        this.inputEl = el.querySelector('#file-input');
		this.csvData = new Map();
        //this.validator = new Validator(el);

        this.loadSampleData();

        const options = this.options;
        if (options.kiosk) {
            const headerEl = document.querySelector('header');
            headerEl.style.display = 'none';
        }

        if (options.model) {
            this.view(options.model, '', new Map());
        }
    }

    /**
     * Sets up the view manager.
     * @return {Viewer}
     */
    createViewer() {
        this.viewerEl = document.createElement('div');
        this.viewerEl.classList.add('viewer');
        this.dropEl.innerHTML = '';
        this.dropEl.appendChild(this.viewerEl);
        this.viewer = new Viewer(this.viewerEl, this.options);
        return this.viewer;
    }

    /**
     * Loads a fileset provided by user action.
     * @param  {Map<string, File>} fileMap
     */
    load(fileMap) {
        let rootFile;
        let rootPath;
        Array.from(fileMap).forEach(([path, file]) => {
            if (file.name.match(/\.(gltf|glb)$/)) {
                rootFile = file;
                rootPath = path.replace(file.name, '');
            }
        });

        if (!rootFile) {
            this.onError('No .gltf or .glb asset found.');
        }

        this.view(rootFile, rootPath, fileMap);
    }

    loadSampleData() {
        fetch('./public/data.csv')
        .then(response => response.text())
        .then((data) => {
            this.csvData = $.csv.toObjects(data);
			
			var parsedData = new Map();
			
			this.csvData.forEach((data) => {
				var min = Number.MAX_VALUE;
				var max = 0;
				var name = "";

				Object.keys(data).forEach(e => {
					if (!isNaN(data[e])) {
						min = Math.min(min, data[e]);
						max = Math.max(max, data[e]);
					}
					else
					{
						name = data[e];
					}
				});
				
				parsedData.set(name, {});
				var dataObj = parsedData.get(name);
				
				Object.keys(data).forEach(e => {
					if (!isNaN(data[e])) {
						dataObj[e] = (data[e] - min) / (max - min);
					}
				});
			});
			
			this.viewer.registerData(parsedData);
        });
		
    }

    /**
     * Passes a model to the viewer, given file and resources.
     * @param  {File|string} rootFile
     * @param  {string} rootPath
     * @param  {Map<string, File>} fileMap
     */
    view(rootFile, rootPath, fileMap) {

        if (this.viewer)
            this.viewer.clear();

        const viewer = this.viewer || this.createViewer();

        const fileURL = typeof rootFile === 'string'
             ? rootFile
             : URL.createObjectURL(rootFile);

        const cleanup = () => {
            this.hideSpinner();
            if (typeof rootFile === 'object')
                URL.revokeObjectURL(fileURL);
        };

        viewer
        .load(fileURL, rootPath, fileMap)
        .catch((e) => this.onError(e))
        .then((gltf) => {
            // TODO: GLTFLoader parsing can fail on invalid files. Ideally,
            // we could run the validator either way.
            //if (!this.options.kiosk) {
            //  this.validator.validate(fileURL, rootPath, fileMap, gltf);
            //}
            cleanup();
        });
    }

    /**
     * @param  {Error} error
     */
    onError(error) {
        let message = (error || {}).message || error.toString();
        if (message.match(/ProgressEvent/)) {
            message = 'Unable to retrieve this file. Check JS console and browser network tab.';
        } else if (message.match(/Unexpected token/)) {
            message = `Unable to parse file content. Verify that this file is valid. Error: "${message}"`;
        } else if (error && error.target && error.target instanceof Image) {
            message = 'Missing texture: ' + error.target.src.split('/').pop();
        }
        window.alert(message);
        console.error(error);
    }

    showSpinner() {
        this.spinnerEl.style.display = '';
    }

    hideSpinner() {
        this.spinnerEl.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {

    const app = new App(document.body, location);

    window.VIEWER.app = app;

    console.info('[glTF Viewer] Debugging data exported as `window.VIEWER`.');

});
