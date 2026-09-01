// 3D 即時姿態視圖:以感測器 Pitch/Roll 驅動大腿/小腿肢段的三維骨架。
// 與 LiveChart 同策略——Three.js 命令式更新 + rAF 迴圈,不經 React 重繪,
// 25Hz 封包流下仍保持 60fps。無磁力計,水平轉向 (Yaw) 固定不呈現。
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useStore } from '../store/useStore'
import { onThemeChange, themeToken } from '../services/theme'

const THIGH_LEN = 1.0
const SHIN_LEN = 0.95
const HIP_Y = THIGH_LEN + SHIN_LEN + 0.25

/** 建立以「頂端」為樞紐的肢段群組(cylinder 原點在中心,故內部下移半長) */
function makeSegment(len: number, material: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.058, len, 20), material)
  mesh.position.y = -len / 2
  group.add(mesh)
  return group
}

function makeJoint(radius: number, material: THREE.MeshStandardMaterial): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material)
}

export function Leg3D(): JSX.Element {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50)
    camera.position.set(2.4, 2.2, 3.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.1, 0)
    controls.enableDamping = true
    controls.minDistance = 1.5
    controls.maxDistance = 8

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1)
    dirLight.position.set(3, 5, 2)
    scene.add(dirLight)

    const thighMat = new THREE.MeshStandardMaterial({ roughness: 0.55 })
    const shinMat = new THREE.MeshStandardMaterial({ roughness: 0.55 })
    const jointMat = new THREE.MeshStandardMaterial({ roughness: 0.4 })
    const kneeMat = new THREE.MeshStandardMaterial({ roughness: 0.4 })

    const thigh = makeSegment(THIGH_LEN, thighMat)
    thigh.position.set(0, HIP_Y, 0)
    scene.add(thigh)

    // 小腿掛在場景層級(非 thigh 子節點):感測器給的是「絕對」姿態角,
    // 直接設定旋轉、每幀把位置對齊膝點即可,免去相對旋轉換算
    const shin = makeSegment(SHIN_LEN, shinMat)
    scene.add(shin)

    const hip = makeJoint(0.11, jointMat)
    hip.position.set(0, HIP_Y, 0)
    const knee = makeJoint(0.1, kneeMat)
    const ankle = makeJoint(0.08, jointMat)
    scene.add(hip, knee, ankle)

    // 主題 token → 場景配色;膝點三態色由 rAF 迴圈每幀套用
    const kneePalette = { idle: new THREE.Color(), inZone: new THREE.Color(), error: new THREE.Color() }
    let grid: THREE.GridHelper | null = null
    const applyTheme = (): void => {
      scene.background = new THREE.Color(themeToken('--leg3d-bg'))
      thighMat.color.set(themeToken('--thigh'))
      shinMat.color.set(themeToken('--shin'))
      jointMat.color.set(themeToken('--text-dim'))
      kneePalette.idle.set(themeToken('--accent'))
      kneePalette.inZone.set(themeToken('--success'))
      kneePalette.error.set(themeToken('--danger'))
      if (grid) {
        scene.remove(grid)
        grid.geometry.dispose()
        ;(grid.material as THREE.Material).dispose()
      }
      grid = new THREE.GridHelper(
        4,
        20,
        new THREE.Color(themeToken('--leg3d-grid-major')),
        new THREE.Color(themeToken('--leg3d-grid-minor'))
      )
      scene.add(grid)
    }
    applyTheme()
    const unsubTheme = onThemeChange(applyTheme)

    // 由 store 訂閱餵入的目標姿態(rAF 迴圈內做平滑趨近)
    const target = { tp: 0, tr: 0, sp: 0, sr: 0, inZone: false, error: false }
    const unsub = useStore.subscribe((s) => {
      if (s.angles && !s.hardwareError) {
        target.tp = s.angles.thigh
        target.tr = s.angles.thighRoll
        target.sp = s.angles.shin
        target.sr = s.angles.shinRoll
      }
      target.inZone = s.session.inZone
      target.error = s.hardwareError != null
    })

    const cur = { tp: 0, tr: 0, sp: 0, sr: 0 }
    const d2r = THREE.MathUtils.degToRad
    const kneePos = new THREE.Vector3()
    const anklePos = new THREE.Vector3()

    let raf = 0
    const animate = (): void => {
      raf = requestAnimationFrame(animate)

      const k = 0.3
      cur.tp += (target.tp - cur.tp) * k
      cur.tr += (target.tr - cur.tr) * k
      cur.sp += (target.sp - cur.sp) * k
      cur.sr += (target.sr - cur.sr) * k

      // Pitch 繞 X 軸(矢狀面,正值向前 +Z)、Roll 繞 Z 軸(冠狀面)
      thigh.rotation.set(d2r(-cur.tp), 0, d2r(cur.tr))
      shin.rotation.set(d2r(-cur.sp), 0, d2r(cur.sr))

      kneePos.set(0, -THIGH_LEN, 0).applyEuler(thigh.rotation).add(thigh.position)
      knee.position.copy(kneePos)
      shin.position.copy(kneePos)
      anklePos.set(0, -SHIN_LEN, 0).applyEuler(shin.rotation).add(shin.position)
      ankle.position.copy(anklePos)

      kneeMat.color.copy(
        target.error ? kneePalette.error : target.inZone ? kneePalette.inZone : kneePalette.idle
      )

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const resize = (): void => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      unsub()
      unsubTheme()
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
    }
  }, [])

  return <div ref={mountRef} className="leg3d-viewport" />
}
