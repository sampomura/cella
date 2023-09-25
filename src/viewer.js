import {
    AmbientLight,
    AnimationMixer,
    AxesHelper,
    Box3,
    Cache,
    Color,
    DirectionalLight,
    GridHelper,
    HemisphereLight,
    LoaderUtils,
    LoadingManager,
    PMREMGenerator,
    PerspectiveCamera,
    REVISION,
    Scene,
    SkeletonHelper,
    Vector3,
    WebGLRenderer,
    LinearToneMapping,
    ACESFilmicToneMapping
}
from 'three';
import * as THREE from 'three';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import {
    GLTFLoader
}
from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
    KTX2Loader
}
from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
    DRACOLoader
}
from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
    MeshoptDecoder
}
from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
    OrbitControls
}
from 'three/examples/jsm/controls/OrbitControls.js';
import {
    EXRLoader
}
from 'three/examples/jsm/loaders/EXRLoader.js';
import {
    RoomEnvironment
}
from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
    environments
}
from './environments.js';

const DEFAULT_CAMERA = '[default]';

const MANAGER = new LoadingManager();
const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`
    const DRACO_LOADER = new DRACOLoader(MANAGER).setDecoderPath(`${THREE_PATH}/examples/jsm/libs/draco/gltf/`);
const KTX2_LOADER = new KTX2Loader(MANAGER).setTranscoderPath(`${THREE_PATH}/examples/jsm/libs/basis/`);

const IS_IOS = isIOS();

const Preset = {
    ASSET_GENERATOR: 'assetgenerator'
};

Cache.enabled = true;

var imguiReady = false;
var modelReady = false;

(async function () {
    await ImGui.default();
    const canvas = document.getElementById("output");
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = canvas.scrollWidth * devicePixelRatio;
    canvas.height = canvas.scrollHeight * devicePixelRatio;
    window.addEventListener("resize", () => {
        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = canvas.scrollWidth * devicePixelRatio;
        canvas.height = canvas.scrollHeight * devicePixelRatio;
    });

    ImGui.CreateContext();
    ImGui_Impl.Init(canvas);

    ImGui.StyleColorsDark();
    //ImGui.StyleColorsClassic();

    const clear_color = new ImGui.ImVec4(0.3, 0.3, 0.3, 1.00);

    ImGui_Impl.Init(canvas);
	imguiReady = true;
})();

export class Viewer {

    constructor(el, options) {
        this.el = el;
        this.options = options;

        this.lights = [];
        this.content = null;
        this.mixer = null;
        this.clips = [];
        this.gui = null;

        this.state = {
            environment: options.preset === Preset.ASSET_GENERATOR
             ? environments.find((e) => e.id === 'footprint-court').name
             : environments[1].name,
            background: false,
            playbackSpeed: 1.0,
            actionStates: {},
            camera: DEFAULT_CAMERA,
            wireframe: false,
            skeleton: false,
            grid: false,
            autoRotate: false,

            // Lights
            punctualLights: true,
            exposure: 0.0,
            toneMapping: LinearToneMapping,
            ambientIntensity: 0.3,
            ambientColor: '#FFFFFF',
            directIntensity: 0.8 * Math.PI, // TODO(#116)
            directColor: '#FFFFFF',
            bgColor: '#191919',
			
			// Gene Settings
            geneType: "AT1G01220-FKGP",
            geneTypeIndex: 0,
            geneTypeSearch: new ImGui.ImStringBuffer(64),
			hideCells: false,
			hideCellThreshold: 0.0,
        };

        this.prevTime = 0;

        this.materials = new Map();

        this.stats = new Stats();
        this.stats.dom.height = '48px';
        [].forEach.call(this.stats.dom.children, (child) => (child.style.display = ''));

        this.backgroundColor = new Color(this.state.bgColor);

        this.scene = new Scene();
        this.scene.background = this.backgroundColor;

        const fov = options.preset === Preset.ASSET_GENERATOR
             ? 0.8 * 180 / Math.PI
             : 60;
        this.defaultCamera = new PerspectiveCamera(fov, el.clientWidth / el.clientHeight, 0.01, 1000);
        this.activeCamera = this.defaultCamera;
        this.scene.add(this.defaultCamera);

        const canvas = document.getElementById("output");
        this.renderer = window.renderer = new WebGLRenderer({
            canvas: canvas,
            antialias: true
        });
        this.renderer.useLegacyLights = false;
        this.renderer.setClearColor(0xcccccc);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(el.clientWidth, el.clientHeight);

        this.pmremGenerator = new PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();

        this.neutralEnvironment = this.pmremGenerator.fromScene(new RoomEnvironment()).texture;

        this.controls = new OrbitControls(this.defaultCamera, this.renderer.domElement);
        this.controls.screenSpacePanning = true;

        this.el.appendChild(this.renderer.domElement);

        this.cameraCtrl = null;
        this.cameraFolder = null;
        this.animFolder = null;
        this.animCtrls = [];
        this.morphFolder = null;
        this.morphCtrls = [];
        this.skeletonHelpers = [];
        this.gridHelper = null;
        this.axesHelper = null;

        this.addAxesHelper();
        //this.addGUI();
        if (options.kiosk)
            this.gui.close();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
        window.addEventListener('resize', this.resize.bind(this), false);
    }

    animate(time) {

        requestAnimationFrame(this.animate);
		if(!modelReady || !imguiReady)
			return;

        const dt = (time - this.prevTime) / 1000;

        this.controls.update();
        this.stats.update();
        this.mixer && this.mixer.update(dt);
        this.render(time);

        this.prevTime = time;

    }

    render(time) {
        ImGui_Impl.NewFrame(time);
        ImGui.NewFrame();

        this.updateImGui();

        ImGui.EndFrame();

        ImGui.Render();

        this.controls.enabled = !ImGui.GetIO().WantCaptureMouse;

        this.renderer.render(this.scene, this.activeCamera);
        if (this.state.grid) {
            this.axesCamera.position.copy(this.defaultCamera.position)
            this.axesCamera.lookAt(this.axesScene.position)
            this.axesRenderer.render(this.axesScene, this.axesCamera);
        }

        ImGui_Impl.RenderDrawData(ImGui.GetDrawData());

        // TODO: restore WebGL state in ImGui Impl
        renderer.state.reset();
    }

    resize() {

        const {
            clientHeight,
            clientWidth
        } = this.el.parentElement;

        this.defaultCamera.aspect = clientWidth / clientHeight;
        this.defaultCamera.updateProjectionMatrix();
        this.renderer.setSize(clientWidth, clientHeight);

        this.axesCamera.aspect = this.axesDiv.clientWidth / this.axesDiv.clientHeight;
        this.axesCamera.updateProjectionMatrix();
        this.axesRenderer.setSize(this.axesDiv.clientWidth, this.axesDiv.clientHeight);
    }

    load(url, rootPath, assetMap) {

        const baseURL = LoaderUtils.extractUrlBase(url);

        // Load.
        return new Promise((resolve, reject) => {

            // Intercept and override relative URLs.
            MANAGER.setURLModifier((url, path) => {

                // URIs in a glTF file may be escaped, or not. Assume that assetMap is
                // from an un-escaped source, and decode all URIs before lookups.
                // See: https://github.com/donmccurdy/three-gltf-viewer/issues/146
                const normalizedURL = rootPath + decodeURI(url)
                    .replace(baseURL, '')
                    .replace(/^(\.?\/)/, '');

                if (assetMap.has(normalizedURL)) {
                    const blob = assetMap.get(normalizedURL);
                    const blobURL = URL.createObjectURL(blob);
                    blobURLs.push(blobURL);
                    return blobURL;
                }

                return (path || '') + url;

            });

            const loader = new GLTFLoader(MANAGER)
                .setCrossOrigin('anonymous')
                .setDRACOLoader(DRACO_LOADER)
                .setKTX2Loader(KTX2_LOADER.detectSupport(this.renderer))
                .setMeshoptDecoder(MeshoptDecoder);

            const blobURLs = [];

            loader.load(url, (gltf) => {

                window.VIEWER.json = gltf;

                const scene = gltf.scene || gltf.scenes[0];
                const clips = gltf.animations || [];

                if (!scene) {
                    // Valid, but not supported by this viewer.
                    throw new Error(
                        'This model contains no scene, and cannot be viewed here. However,'
                         + ' it may contain individual 3D resources.');
                }

                this.setContent(scene, clips);

                blobURLs.forEach(URL.revokeObjectURL);

                // See: https://github.com/google/draco/issues/349
                // DRACOLoader.releaseDecoderModule();

                resolve(gltf);

            }, undefined, reject);

        });

    }

    /**
     * @param {THREE.Object3D} object
     * @param {Array<THREE.AnimationClip} clips
     */
    setContent(object, clips) {

        this.clear();

        object.updateMatrixWorld(); // donmccurdy/three-gltf-viewer#330

        const box = new Box3().setFromObject(object);
        const size = box.getSize(new Vector3()).length();
        const center = box.getCenter(new Vector3());

        this.controls.reset();

        object.position.x += (object.position.x - center.x);
        object.position.y += (object.position.y - center.y);
        object.position.z += (object.position.z - center.z);
        this.controls.maxDistance = size * 10;
        this.defaultCamera.near = size / 100;
        this.defaultCamera.far = size * 100;
        this.defaultCamera.updateProjectionMatrix();

        if (this.options.cameraPosition) {

            this.defaultCamera.position.fromArray(this.options.cameraPosition);
            this.defaultCamera.lookAt(new Vector3());

        } else {

            this.defaultCamera.position.copy(center);
            this.defaultCamera.position.x += size / 2.0;
            this.defaultCamera.position.y += size / 5.0;
            this.defaultCamera.position.z += size / 2.0;
            this.defaultCamera.lookAt(center);

        }

        this.setCamera(DEFAULT_CAMERA);

        this.axesCamera.position.copy(this.defaultCamera.position)
        this.axesCamera.lookAt(this.axesScene.position)
        this.axesCamera.near = size / 100;
        this.axesCamera.far = size * 100;
        this.axesCamera.updateProjectionMatrix();
        this.axesCorner.scale.set(size, size, size);

        this.controls.saveState();

        this.scene.add(object);
        this.content = object;

        this.state.punctualLights = true;

        this.content.traverse((node) => {
            if (node.isLight) {
                this.state.punctualLights = false;
            } else if (node.isMesh) {
                // TODO(https://github.com/mrdoob/three.js/pull/18235): Clean up.

                var name = node.name;
                name = name.replace(/\d{3}$/, '');
                name = name.replace(/_/g, ' ');

                if (!this.materials.has(name)) {
                    this.materials.set(name, new THREE.MeshPhongMaterial());
                }

                var material = this.materials.get(name);
                node.material = material;
            }
        });
		this.updateMaterials();

        this.setClips(clips);

        this.updateLights();
        this.updateEnvironment();
        this.updateDisplay();

        window.VIEWER.scene = this.content;

		modelReady = true;
        //this.printGraph(this.content);
    }

    printGraph(node) {

        console.group(' <' + node.type + '> ' + node.name);
        node.children.forEach((child) => this.printGraph(child));
        console.groupEnd();

    }

    /**
     * @param {Array<THREE.AnimationClip} clips
     */
    setClips(clips) {
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer.uncacheRoot(this.mixer.getRoot());
            this.mixer = null;
        }

        this.clips = clips;
        if (!clips.length)
            return;

        this.mixer = new AnimationMixer(this.content);
    }

    playAllClips() {
        this.clips.forEach((clip) => {
            this.mixer.clipAction(clip).reset().play();
            this.state.actionStates[clip.name] = true;
        });
    }

    /**
     * @param {string} name
     */
    setCamera(name) {
        if (name === DEFAULT_CAMERA) {
            this.controls.enabled = true;
            this.activeCamera = this.defaultCamera;
        } else {
            this.controls.enabled = false;
            this.content.traverse((node) => {
                if (node.isCamera && node.name === name) {
                    this.activeCamera = node;
                }
            });
        }
    }

    updateLights() {
        const state = this.state;
        const lights = this.lights;

        if (state.punctualLights && !lights.length) {
            this.addLights();
        } else if (!state.punctualLights && lights.length) {
            this.removeLights();
        }

        this.renderer.toneMapping = Number(state.toneMapping);
        this.renderer.toneMappingExposure = Math.pow(2, state.exposure);

        if (lights.length === 2) {
            lights[0].intensity = state.ambientIntensity;
            lights[0].color.set(state.ambientColor);
            lights[1].intensity = state.directIntensity;
            lights[1].color.set(state.directColor);
        }
    }

    addLights() {
        const state = this.state;

        if (this.options.preset === Preset.ASSET_GENERATOR) {
            const hemiLight = new HemisphereLight();
            hemiLight.name = 'hemi_light';
            this.scene.add(hemiLight);
            this.lights.push(hemiLight);
            return;
        }

        const light1 = new AmbientLight(state.ambientColor, state.ambientIntensity);
        light1.name = 'ambient_light';
        this.defaultCamera.add(light1);

        const light2 = new DirectionalLight(state.directColor, state.directIntensity);
        light2.position.set(0.5, 0, 0.866); // ~60º
        light2.name = 'main_light';
        this.defaultCamera.add(light2);

        this.lights.push(light1, light2);
    }

    removeLights() {

        this.lights.forEach((light) => light.parent.remove(light));
        this.lights.length = 0;

    }

    updateEnvironment() {

        const environment = environments.filter((entry) => entry.name === this.state.environment)[0];

        this.getCubeMapTexture(environment).then(({
                envMap
            }) => {

            this.scene.environment = envMap;
            this.scene.background = this.state.background ? envMap : this.backgroundColor;

        });

    }

    getCubeMapTexture(environment) {
        const {
            id,
            path
        } = environment;

        // neutral (THREE.RoomEnvironment)
        if (id === 'neutral') {

            return Promise.resolve({
                envMap: this.neutralEnvironment
            });

        }

        // none
        if (id === '') {

            return Promise.resolve({
                envMap: null
            });

        }

        return new Promise((resolve, reject) => {

            new EXRLoader()
            .load(path, (texture) => {

                const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                this.pmremGenerator.dispose();

                resolve({
                    envMap
                });

            }, undefined, reject);

        });

    }

    updateDisplay() {
        if (this.skeletonHelpers.length) {
            this.skeletonHelpers.forEach((helper) => this.scene.remove(helper));
        }

        traverseMaterials(this.content, (material) => {
            material.wireframe = this.state.wireframe;
        });

        this.content.traverse((node) => {
            if (node.isMesh && node.skeleton && this.state.skeleton) {
                const helper = new SkeletonHelper(node.skeleton.bones[0].parent);
                helper.material.linewidth = 3;
                this.scene.add(helper);
                this.skeletonHelpers.push(helper);
            }
        });

        if (this.state.grid !== Boolean(this.gridHelper)) {
            if (this.state.grid) {
                this.gridHelper = new GridHelper(50, 50);
                this.axesHelper = new AxesHelper();
                this.axesHelper.renderOrder = 999;
                this.axesHelper.onBeforeRender = (renderer) => renderer.clearDepth();
                this.scene.add(this.gridHelper);
                this.scene.add(this.axesHelper);
            } else {
                this.scene.remove(this.gridHelper);
                this.scene.remove(this.axesHelper);
                this.gridHelper = null;
                this.axesHelper = null;
                this.axesRenderer.clear();
            }
        }

        this.controls.autoRotate = this.state.autoRotate;
    }

    updateBackground() {

        this.backgroundColor.set(this.state.bgColor);

    }

    /**
     * Adds AxesHelper.
     *
     * See: https://stackoverflow.com/q/16226693/1314762
     */
    addAxesHelper() {
        this.axesDiv = document.createElement('div');
        this.el.appendChild(this.axesDiv);
        this.axesDiv.classList.add('axes');

        const {
            clientWidth,
            clientHeight
        } = this.axesDiv;

        this.axesScene = new Scene();
        this.axesCamera = new PerspectiveCamera(50, clientWidth / clientHeight, 0.1, 10);
        this.axesScene.add(this.axesCamera);

        this.axesRenderer = new WebGLRenderer({
            alpha: true
        });
        this.axesRenderer.setPixelRatio(window.devicePixelRatio);
        this.axesRenderer.setSize(this.axesDiv.clientWidth, this.axesDiv.clientHeight);

        this.axesCamera.up = this.defaultCamera.up;

        this.axesCorner = new AxesHelper(5);
        this.axesScene.add(this.axesCorner);
        this.axesDiv.appendChild(this.axesRenderer.domElement);
    }

    updateImGui() {
        const componentToHex = (c) => {
            var hex = Math.round(c * 255.0).toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }

        const hex2rgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16) / 255.0;
            const g = parseInt(hex.slice(3, 5), 16) / 255.0;
            const b = parseInt(hex.slice(5, 7), 16) / 255.0;

            return {
                r,
                g,
                b
            };
        }

        var settingDirty = false;
        const sidebarWidth = 200;

        ImGui.SetNextWindowSize(new ImGui.ImVec2(sidebarWidth, this.el.clientHeight));
        ImGui.SetNextWindowPos(new ImGui.ImVec2(this.el.clientWidth - sidebarWidth, 0));
        ImGui.Begin("Control Bar", null, ImGui.WindowFlags.NoMove | ImGui.WindowFlags.NoResize);

        if (ImGui.CollapsingHeader("Render Settings")) {
            settingDirty |= ImGui.Checkbox("Auto Rotate", (_ = this.state.autoRotate) => this.state.autoRotate = _);
            settingDirty |= ImGui.Checkbox("Show Grid", (_ = this.state.grid) => this.state.grid = _);

            ImGui.Separator();
            ImGui.Text("Background Color");
            var color = hex2rgb(this.state.bgColor);
            if (ImGui.ColorPicker3("Background Color", color, ImGui.ColorEditFlags.NoSidePreview | ImGui.ColorEditFlags.NoLabel)) {
                settingDirty = true;
                this.state.bgColor = "#" + componentToHex(color.r) + componentToHex(color.g) + componentToHex(color.b);
            }
        }
		
        if (ImGui.CollapsingHeader("Data Filtering")) {
            settingDirty |= ImGui.Checkbox("Hide Unaffected Cells", (_ = this.state.hideCells) => this.state.hideCells = _);
			settingDirty |= ImGui.SliderFloat("Threshold", (_ = this.state.hideCellThreshold) => this.state.hideCellThreshold = _, 0.0, 1.0);
        }

        if (ImGui.CollapsingHeader("Select Data Entry", ImGui.ImGuiTreeNodeFlags.DefaultOpen)) {
            ImGui.Text(`Current: ${this.state.geneType}`);

            ImGui.SetNextItemWidth(ImGui.GetContentRegionAvail().x);
            ImGui.InputTextWithHint("##SearchGene", "Search Gene", this.state.geneTypeSearch);

            ImGui.Separator();
            ImGui.Text("Avialable Data");
			ImGui.PushStyleVar(ImGui.StyleVar.GrabMinSize, 40);
            if (ImGui.BeginChild("GeneList")) {
                ImGui.PushStyleVar(ImGui.StyleVar.ButtonTextAlign, new ImGui.ImVec2(0.0, 0.5));

                var clipper = new ImGui.ImGuiListClipper();
				var keys = Array.from(this.geneData.keys());
				if(this.state.geneTypeSearch.buffer)
				{
					keys = keys.filter((data) => data.toLowerCase().includes(this.state.geneTypeSearch.buffer.toLowerCase()));
				}
				
                clipper.Begin(keys.length);
                while (clipper.Step())
				{
                    for (let i = clipper.DisplayStart; i < clipper.DisplayEnd; i++) {
						var displayed = this.state.geneType == keys[i];
						if(displayed) ImGui.PushStyleColor(ImGui.ImGuiCol.Button, 0xFF44AA44);
							
						if (ImGui.Button(`${keys[i]}`, new ImGui.ImVec2(ImGui.GetContentRegionAvail().x, 0))) {
                            this.state.geneType = keys[i];
							settingDirty = true;
					    }
						
						if(displayed) ImGui.PopStyleColor();
                    }
				}
				
				ImGui.PopStyleVar();
            }
            ImGui.EndChild();
			ImGui.PopStyleVar();
        }

        ImGui.End();

        if (settingDirty) {
            this.updateDisplay();
            this.updateBackground();
			this.updateMaterials();
        }
    }

    clear() {
        if (!this.content)
            return;

        this.scene.remove(this.content);

        // dispose geometry
        this.content.traverse((node) => {
            if (!node.isMesh)
                return;

            node.geometry.dispose();
        });

        // dispose textures
        traverseMaterials(this.content, (material) => {
            for (const key in material) {

                if (key !== 'envMap' && material[key] && material[key].isTexture) {

                    material[key].dispose();

                }

            }
        });
    }

    forEachDataEntry(value, key, map) {
        var viewer = parent.VIEWER.app.viewer;
        var obj = {
            displayGene: function () {
                viewer.state.geneType = key;
                viewer.updateMaterials()
            }
        };
        obj.key = key;
        viewer.allFolder.add(obj, 'displayGene').name("Display " + key);
    }

    registerData(data) {
        this.geneData = data;
    }

    updateMaterials() {
		if(!this.geneData)
			return;
		
        // Load Gene type data
        var geneInfo = this.geneData.get(this.state.geneType);
		if(!geneInfo)
			return;
		
        Object.keys(geneInfo).forEach(e => {
			var value = geneInfo[e];
			var material = this.materials.get(e);
            material.color.g = 1.0 - (value * 0.7);
            material.color.b = 1.0 - (value * 0.7);
			material.visible = !this.state.hideCells || value > this.state.hideCellThreshold;
        });
		
		var header = document.getElementById("headerText");
		header.text = `Website Name Here: Displaying ${this.state.geneType}`;
    }
};

function traverseMaterials(object, callback) {
    object.traverse((node) => {
        if (!node.isMesh)
            return;
        const materials = Array.isArray(node.material)
             ? node.material
             : [node.material];
        materials.forEach(callback);
    });
}

// https://stackoverflow.com/a/9039885/1314762
function isIOS() {
    return [
        'iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod'
    ].includes(navigator.platform)
    // iPad on iOS 13 detection
     || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
}
