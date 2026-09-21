import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import Layout from './components/layout/Layout.jsx'

const Landing = lazy(() => import('./pages/Landing.jsx'))
const Explore = lazy(() => import('./pages/Explore.jsx'))
const PlaceDetail = lazy(() => import('./pages/PlaceDetail.jsx'))
const Planner = lazy(() => import('./pages/Planner.jsx'))
const ShareVideo = lazy(() => import('./pages/ShareVideo.jsx'))
const Community = lazy(() => import('./pages/Community.jsx'))
const NearbyEats = lazy(() => import('./pages/NearbyEats.jsx'))
const SavedTrips = lazy(() => import('./pages/SavedTrips.jsx'))
const SavedPlaces = lazy(() => import('./pages/SavedPlaces.jsx'))
const SharedTrip = lazy(() => import('./pages/SharedTrip.jsx'))
const LiveTrip = lazy(() => import('./pages/LiveTrip.jsx'))
const BookingRoom = lazy(() => import('./pages/BookingRoom.jsx'))
const BookingReturn = lazy(() => import('./pages/BookingReturn.jsx'))
const MyBookings = lazy(() => import('./pages/MyBookings.jsx'))
const InfoPage = lazy(() => import('./pages/InfoPage.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

function PageFallback() {
  return <div role="status" className="mx-auto max-w-[1180px] px-5 py-16 text-center font-utility text-sm text-ink-muted">Đang tải… / Loading…</div>
}

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LanguageProvider>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Landing />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/place/:id" element={<PlaceDetail />} />
                <Route path="/plan" element={<Planner />} />
                <Route path="/nearby" element={<NearbyEats />} />
                <Route path="/trips" element={<SavedTrips />} />
                <Route path="/saved" element={<SavedPlaces />} />
                <Route path="/trip/:id" element={<SharedTrip />} />
                <Route path="/live/:id" element={<LiveTrip />} />
                <Route path="/bookings" element={<MyBookings />} />
                <Route path="/booking/return" element={<BookingReturn />} />
                <Route path="/booking/:placeId" element={<BookingRoom />} />
                <Route path="/share" element={<ShareVideo />} />
                <Route path="/community" element={<Community />} />
                <Route path="/community/:postId" element={<Community />} />
                <Route path="/about" element={<InfoPage page="about" />} />
                <Route path="/careers" element={<InfoPage page="careers" />} />
                <Route path="/blog" element={<InfoPage page="blog" />} />
                <Route path="/help" element={<InfoPage page="help" />} />
                <Route path="/contact" element={<InfoPage page="contact" />} />
                <Route path="/terms" element={<InfoPage page="terms" />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </LanguageProvider>
    </MotionConfig>
  )
}

export default App
