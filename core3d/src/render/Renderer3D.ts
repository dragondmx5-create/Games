import * as THREE from 'three';
import type { GameSnapshot } from '../core/types';

export class Renderer3D {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly playerMesh: THREE.Mesh;
  private readonly enemyMeshes = new Map<string, THREE.Mesh>();
  private readonly wallGroup = new THREE.Group();

  constructor(container: HTMLElement, snapshot: GameSnapshot) {
    this.scene.background = new THREE.Color(0x182025);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xcfe8ff, 0x202820, 1.8);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x506b46, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const playerGeometry = new THREE.CapsuleGeometry(0.45, 0.9, 6, 12);
    this.playerMesh = new THREE.Mesh(
      playerGeometry,
      new THREE.MeshStandardMaterial({ color: 0x55b7ff, roughness: 0.65 }),
    );
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x6c6258, roughness: 0.95 });
    for (const wall of snapshot.walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.width, 1.5, wall.depth), wallMaterial);
      mesh.position.set(wall.x, 0.75, wall.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.wallGroup.add(mesh);
    }
    this.scene.add(this.wallGroup);

    const grid = new THREE.GridHelper(30, 30, 0x26332a, 0x26332a);
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.camera.position.set(0, 13, 14);
    this.camera.lookAt(0, 0, 0);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  render(snapshot: GameSnapshot): void {
    const player = snapshot.player;
    this.playerMesh.position.set(player.position.x, 0.9, player.position.z);
    this.playerMesh.visible = player.alive;

    const activeIds = new Set<string>();
    for (const enemy of snapshot.enemies) {
      activeIds.add(enemy.id);
      let mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 1.2, 0.9),
          new THREE.MeshStandardMaterial({ color: 0xd95757, roughness: 0.8 }),
        );
        mesh.castShadow = true;
        this.enemyMeshes.set(enemy.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(enemy.position.x, 0.6, enemy.position.z);
      mesh.visible = enemy.alive;
      const hpRatio = Math.max(0.35, enemy.hp / enemy.maxHp);
      mesh.scale.set(1, hpRatio, 1);
    }

    for (const [id, mesh] of this.enemyMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.enemyMeshes.delete(id);
      }
    }

    const target = new THREE.Vector3(player.position.x, 0, player.position.z);
    const desired = new THREE.Vector3(player.position.x, 13, player.position.z + 14);
    this.camera.position.lerp(desired, 0.08);
    this.camera.lookAt(target);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly resize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}
