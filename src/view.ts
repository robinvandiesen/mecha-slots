import * as THREE from 'three';
import { FIELD_TOP, FIELD_X, H, LX, LY, W, type Vec } from './layout';

// The 3D camera, and conversions between the deck (world X, Y) and screen
// coordinates (the 1280 x 720 logical canvas). World X maps to Three's x axis,
// world Y to Three's z axis, and height to Three's y axis.

export const FIELD_W = W - FIELD_X;
export const FIELD_H = H - FIELD_TOP;

export const camera = new THREE.PerspectiveCamera(30, FIELD_W / FIELD_H, 10, 8000);

const view = { yaw: 0, zoom: 1.1 };
const target = new THREE.Vector3(LX / 2 - 10, 0, LY / 2);

/** Rotate the view around the deck (limited so the mothership stays at the back). */
export function rotateView(delta: number): void {
  view.yaw = Math.max(-0.9, Math.min(0.9, view.yaw + delta));
  updateCamera();
}

export function zoomView(factor: number): void {
  view.zoom = Math.max(0.7, Math.min(1.8, view.zoom * factor));
  updateCamera();
}

export function updateCamera(): void {
  const dist = 1180 / view.zoom;
  const elev = 0.66;
  const az = Math.PI / 4 + view.yaw;
  camera.position.set(target.x + Math.cos(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, target.z + Math.sin(az) * Math.cos(elev) * dist);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
updateCamera();

const tmp = new THREE.Vector3();

/** Screen position of a point on (or `h` above) the deck. */
export function project(x: number, y: number, h = 0): Vec {
  tmp.set(x, h, y).project(camera);
  return { x: FIELD_X + ((tmp.x + 1) / 2) * FIELD_W, y: FIELD_TOP + ((1 - tmp.y) / 2) * FIELD_H };
}

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();

/** Deck position under a screen point. */
export function unproject(sx: number, sy: number): Vec {
  const ndc = new THREE.Vector2(((sx - FIELD_X) / FIELD_W) * 2 - 1, 1 - ((sy - FIELD_TOP) / FIELD_H) * 2);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(ground, hitPoint)) return { x: 0, y: 0 };
  return { x: hitPoint.x, y: hitPoint.z };
}
