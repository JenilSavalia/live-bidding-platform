import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import AuctionGrid from './components/AuctionGrid';
import Login from './pages/Login';
import Register from './pages/Register';

// Simple Auth Guard
const RequireAuth = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

import Navbar from './components/Navbar';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={
            <RequireAuth>
              <SocketProvider>
                <Navbar />
                <AuctionGrid />
              </SocketProvider>
            </RequireAuth>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
