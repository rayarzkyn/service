import { useState } from 'react';
import { useRouter } from 'next/router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [nama, setNama] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak sama.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Simpan data user di Firestore
      await setDoc(doc(db, 'users', user.uid), {
        email,
        nama,
        role: 'pelanggan',
        dibuatPada: new Date()
      });

      setSuccess('Registrasi berhasil! Silakan login.');
      router.push('/login');
    } catch (err) {
      console.error(err);
      // Lebih ramah: tampilkan pesan singkat bila pesan asli terlalu teknis
      const msg = err?.message || 'Registrasi gagal.';
      setError(msg);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-pink-400 to-purple-500 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Register Pelanggan</h2>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        {success && <p className="text-green-500 text-sm mb-4 text-center">{success}</p>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="nama" className="block text-sm font-medium text-gray-700 mb-1">
              Nama
            </label>
            <input
              id="nama"
              type="text"
              placeholder="Nama Lengkap"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300"
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
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute inset-y-0 right-2 flex items-center px-2 text-gray-600"
              >
                {/* simple eye / eye-off svg */}
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10a9.964 9.964 0 012.189-5.803M3 3l18 18M9.879 9.88A3 3 0 0014.12 14.12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Konfirmasi Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Konfirmasi Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute inset-y-0 right-2 flex items-center px-2 text-gray-600"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10a9.964 9.964 0 012.189-5.803M3 3l18 18M9.879 9.88A3 3 0 0014.12 14.12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-md font-semibold disabled:opacity-60"
          >
            Daftar
          </button>
        </form>

        <p className="mt-4 text-sm text-center">
          Sudah punya akun?{' '}
          <a href="/login" className="text-purple-700 font-semibold hover:underline">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
