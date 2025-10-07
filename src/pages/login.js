import { useState } from 'react';
import { useRouter } from 'next/router';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setResetSent(false);
    setIsLoading(true);

    try {
      // 1. Normalisasi input
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      if (!normalizedEmail || !trimmedPassword) {
        setError('Email dan password harus diisi');
        setIsLoading(false);
        return;
      }

      console.log('Attempting login with:', normalizedEmail);
      
      // 2. Autentikasi dengan Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
      const user = userCredential.user;
      console.log('Auth success, UID:', user.uid);

      // 3. Dapatkan data user dari Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        console.error('User document not found in Firestore');
        setError('Akun tidak valid. Data user tidak ditemukan.');
        setIsLoading(false);
        return;
      }

      const userData = userDocSnap.data();
      console.log('User data from Firestore:', userData);

      // 4. Menggunakan field 'nama' yang benar
      const userName = userData.nama || '';
      const userRole = userData.role;

      if (!userRole) {
        setError('Akun tidak memiliki role yang valid');
        setIsLoading(false);
        return;
      }

      // 5. Simpan data user ke session/local storage
      localStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        nama: userName,
        role: userRole
      }));

      // 6. Redirect berdasarkan role
      switch (userRole.toLowerCase()) {
  case 'admin':
    router.push('/admin');
    break;
  case 'pelanggan':
    router.push('/pelanggan');
    break;
  case 'kepala_toko':
    router.push('/kepala_toko');  // halaman khusus kepala toko
    break;
  default:
    setError('Role tidak dikenali: ' + userRole);
    setIsLoading(false);
}

    } catch (err) {
      console.error('Login error:', {
        code: err.code,
        message: err.message,
        emailAttempted: email,
        time: new Date().toISOString()
      });

      // Handle error spesifik
      if (err.code === 'auth/wrong-password') {
        setError('Kombinasi email dan password tidak cocok');
      } else if (err.code === 'auth/user-not-found') {
        setError('Email tidak terdaftar di sistem');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Terlalu banyak percobaan gagal. Silakan coba lagi nanti');
      } else {
        setError(`Terjadi kesalahan: ${err.message}`);
      }
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Masukkan email terlebih dahulu');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      setError('');
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.message.includes('user-not-found') 
        ? 'Email tidak terdaftar' 
        : 'Gagal mengirim email reset');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-400 to-pink-400">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold text-center mb-6">Login Sistem</h2>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        {resetSent && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
            <p className="text-green-700">Instruksi reset password telah dikirim ke email Anda</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Alamat Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="contoh@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-md text-white font-semibold ${
              isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Memproses...
              </span>
            ) : 'Masuk'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={handleForgotPassword}
            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
            disabled={!email.trim() || isLoading}
          >
            Lupa password?
          </button>
        </div>
      </div>
    </div>
  );
}