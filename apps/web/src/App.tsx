import { Navigate, Outlet, Route, Routes } from 'react-router'
import Cashier from './cashier/Cashier'
import ChipCheck from './dev/ChipCheck'
import { MeProvider } from './me/state'
import { MeActivity, MeHome, MeProfile, MeRefresh, MeTopUp } from './me/screens'
import { Landing, OpsPanel, RolePicker } from './pages/public'
import { PosProvider } from './pos/state'
import { PosApproved, PosConfirm, PosKeypad, PosPin, PosQueue, PosTap, PosToday } from './pos/screens'

// Routes from PRODUCT.md: /, /app, /cashier, /pos, /me, /ops.
// /cashier, /pos and /me run on the card-wallet API (apps/api/API.md).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<RolePicker />} />
      <Route path="/ops" element={<OpsPanel />} />
      <Route path="/cashier" element={<Cashier />} />
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
      <Route
        path="/me"
        element={
          <MeProvider>
            <Outlet />
          </MeProvider>
        }
      >
        <Route index element={<MeHome />} />
        <Route path="topup" element={<MeTopUp />} />
        <Route path="refresh" element={<MeRefresh />} />
        <Route path="activity" element={<MeActivity />} />
        <Route path="profile" element={<MeProfile />} />
      </Route>
      <Route path="/dev/chip" element={<ChipCheck />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
