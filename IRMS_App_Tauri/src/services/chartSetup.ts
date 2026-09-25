// services/chartSetup.ts
// Chart.js tree-shaken components used by every chart in the app. Registration must happen
// in a module each chart imports, not only in LiveChart: LiveChart is lazy-loaded and only
// mounts when the Dashboard "chart" tab is open, so History's analysis chart used to throw
// "line is not a registered controller" and render an empty box (2026-09-25 real-app report).
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend)

export { Chart }
