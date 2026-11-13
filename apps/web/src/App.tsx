import { Outlet, Route, Routes } from 'react-router'
import ChipCheck from './dev/ChipCheck'
import { PosProvider } from './pos/state'
import { PosApproved, PosConfirm, PosKeypad, PosPin, PosQueue, PosTap, PosToday } from './pos/screens'

// Routes from PRODUCT.md: /, /app, /cashier, /pos, /me, /ops. Screens not built yet are added as they land.
export default function App() {
  return (
    <Routes>
      <Route
        path="/pos"
        element={
          <PosProvider>
            <Outlet />
          </PosProvider>
        }
      >
        <Route index element={<PosKeypad />} />
        <Route path="tap" element={<PosTap />} />
        <Route path="confirm" element={<PosConfirm />} />
        <Route path="pin" element={<PosPin />} />
        <Route path="approved/:id" element={<PosApproved />} />
        <Route path="today" element={<PosToday />} />
        <Route path="queue" element={<PosQueue />} />
      </Route>
      <Route path="/dev/chip" element={<ChipCheck />} />
    </Routes>
  )
}
