import { Outlet, Route, Routes } from 'react-router'
import { CashierDone, CashierLayout, CashierLink, CashierLoad, CashierLookup, CashierTap } from './cashier/screens'
import ChipCheck from './dev/ChipCheck'
import { MeActivity, MeAssistant, MeGate, MeHome, MeIntro, MeLogin, MeProfile, MeReceipt, MeScan } from './me/screens'
import { MeProvider } from './me/state'
import { Landing, OpsPanel, RolePicker } from './pages/public'
import { PosApproved, PosConfirm, PosKeypad, PosPin, PosQueue, PosTap, PosToday } from './pos/screens'
import { PosProvider } from './pos/state'

// Routes from PRODUCT.md: /, /app, /cashier, /pos, /me, /ops.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<RolePicker />} />
      <Route path="/ops" element={<OpsPanel />} />

      <Route path="/cashier" element={<CashierLayout />}>
        <Route index element={<CashierTap />} />
        <Route path="lookup" element={<CashierLookup />} />
        <Route path="link" element={<CashierLink />} />
        <Route path="load" element={<CashierLoad />} />
        <Route path="done" element={<CashierDone />} />
      </Route>

      <Route path="/pos" element={<PosProvider><Outlet /></PosProvider>}>
        <Route index element={<PosKeypad />} />
        <Route path="tap" element={<PosTap />} />
        <Route path="confirm" element={<PosConfirm />} />
        <Route path="pin" element={<PosPin />} />
        <Route path="approved/:id" element={<PosApproved />} />
        <Route path="today" element={<PosToday />} />
        <Route path="queue" element={<PosQueue />} />
      </Route>

      <Route path="/me" element={<MeProvider><Outlet /></MeProvider>}>
        <Route path="intro" element={<MeIntro />} />
        <Route path="login" element={<MeLogin />} />
        <Route element={<MeGate><Outlet /></MeGate>}>
          <Route index element={<MeHome />} />
          <Route path="scan" element={<MeScan />} />
          <Route path="receipt/:id" element={<MeReceipt />} />
          <Route path="activity" element={<MeActivity />} />
          <Route path="assistant" element={<MeAssistant />} />
          <Route path="profile" element={<MeProfile />} />
        </Route>
      </Route>

      <Route path="/dev/chip" element={<ChipCheck />} />
    </Routes>
  )
}
