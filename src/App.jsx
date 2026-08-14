import { Routes, Route } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import Layout from './components/layout/Layout.jsx'
import Landing from './pages/Landing.jsx'
import Explore from './pages/Explore.jsx'
import PlaceDetail from './pages/PlaceDetail.jsx'
import Planner from './pages/Planner.jsx'
import ShareVideo from './pages/ShareVideo.jsx'
import NearbyEats from './pages/NearbyEats.jsx'
import SavedTrips from './pages/SavedTrips.jsx'
import SharedTrip from './pages/SharedTrip.jsx'
import BookingRoom from './pages/BookingRoom.jsx'
import BookingReturn from './pages/BookingReturn.jsx'
import MyBookings from './pages/MyBookings.jsx'
import NotFound from './pages/NotFound.jsx'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/place/:id" element={<PlaceDetail />} />
              <Route path="/plan" element={<Planner />} />
              <Route path="/nearby" element={<NearbyEats />} />
              <Route path="/trips" element={<SavedTrips />} />
              <Route path="/trip/:id" element={<SharedTrip />} />
              <Route path="/bookings" element={<MyBookings />} />
              <Route path="/booking/return" element={<BookingReturn />} />
              <Route path="/booking/:placeId" element={<BookingRoom />} />
              <Route path="/share" element={<ShareVideo />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </MotionConfig>
  )
}

export default App
