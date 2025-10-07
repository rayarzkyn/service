import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Phone, Wrench, ShoppingBag, Info, Mail } from 'lucide-react';

export default function HomePage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#b3e5fc] via-[#f3e5f5] to-[#fff] text-gray-800 flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 bg-white bg-opacity-80 backdrop-blur z-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-purple-700 tracking-wide">Goku Komunika</h1>
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="focus:outline-none text-purple-700 text-2xl"
            >
              ☰
            </button>
          </div>
          <nav className="hidden md:flex items-center space-x-6 font-medium">
            <a href="#profil" className="hover:text-purple-600 transition">Profil</a>
            <a href="#tentang" className="hover:text-purple-600 transition">Tentang Kami</a>
            <a href="#website" className="hover:text-purple-600 transition">Tentang Website</a>
            <a href="#kontak" className="hover:text-purple-600 transition">Kontak</a>
            <Link href="/login">
              <span className="ml-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition shadow">Login</span>
            </Link>
            
          </nav>
        </div>
        {/* Mobile Menu */}
        {isOpen && (
          <nav className="md:hidden px-4 pb-4 space-y-2">
            <a href="#profil" className="block hover:text-purple-600">Profil</a>
            <a href="#tentang" className="block hover:text-purple-600">Tentang Kami</a>
            <a href="#website" className="block hover:text-purple-600">Tentang Website</a>
            <a href="#kontak" className="block hover:text-purple-600">Kontak</a>
            <Link href="/login">
              <span className="block mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-center hover:bg-purple-700 transition">Login</span>
            </Link>
            
          </nav>
        )}
      </header>

      {/* Content Sections */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 space-y-12">
        <motion.section
          id="profil"
          className="text-center border border-gray-300/50 rounded-xl p-8 shadow-lg bg-white bg-opacity-90"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Phone className="mx-auto text-purple-700 w-12 h-12 mb-3" />
          <h2 className="text-3xl font-bold text-purple-700 mb-4">Profil Toko</h2>
          <p className="text-lg leading-relaxed text-gray-700">
            <strong>Goku Komunika</strong> adalah pusat layanan dan penjualan handphone yang telah dipercaya masyarakat
            selama bertahun-tahun. Kami menyediakan jasa perbaikan cepat, penjualan berbagai merek HP terbaru,
            dan aksesori lengkap untuk memenuhi semua kebutuhan komunikasi Anda. Dengan mengutamakan <em>kecepatan</em>,
            <em>ketepatan</em>, dan <em>kepuasan pelanggan</em>, kami menjadi mitra terbaik bagi siapa saja yang ingin
            tetap terhubung tanpa hambatan.
          </p>
        </motion.section>

        <motion.section
          id="tentang"
          className="text-center border border-gray-300/50 rounded-xl p-8 shadow-lg bg-white bg-opacity-90"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Info className="mx-auto text-purple-700 w-12 h-12 mb-3" />
          <h2 className="text-3xl font-bold text-purple-700 mb-4">Tentang Kami</h2>
          <p className="text-lg leading-relaxed text-gray-700">
            Kami berdiri dengan komitmen untuk memberikan solusi terbaik dalam dunia komunikasi. Mulai dari
            perbaikan perangkat yang rusak, penjualan unit baru, hingga menyediakan perlengkapan tambahan
            seperti charger, earphone, dan casing berkualitas. Dengan teknisi berpengalaman dan harga yang
            transparan, setiap layanan yang kami berikan selalu mengutamakan kepercayaan dan kepuasan pelanggan.
          </p>
        </motion.section>

        <motion.section
          id="website"
          className="text-center border border-gray-300/50 rounded-xl p-8 shadow-lg bg-white bg-opacity-90"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <ShoppingBag className="mx-auto text-purple-700 w-12 h-12 mb-3" />
          <h2 className="text-3xl font-bold text-purple-700 mb-4">Tentang Website</h2>
          <p className="text-lg leading-relaxed text-gray-700">
            Website ini dirancang sebagai pusat informasi dan sistem manajemen internal untuk Goku Komunika.
            Di sini, pelanggan dapat memantau status perbaikan perangkat, sedangkan admin dapat mengelola stok barang,
            pencatatan penjualan, dan pengaturan layanan dengan mudah. Desainnya dibuat agar <em>user-friendly</em>,
            responsif, dan dapat diakses kapan saja dari berbagai perangkat.
          </p>
        </motion.section>

        <motion.section
          id="kontak"
          className="text-center border border-gray-300/50 rounded-xl p-8 shadow-lg bg-white bg-opacity-90"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Mail className="mx-auto text-purple-700 w-12 h-12 mb-3" />
          <h2 className="text-3xl font-bold text-purple-700 mb-4">Kontak Kami</h2>
          <p className="text-lg text-gray-700 mb-2">
            <strong>Alamat:</strong> Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang
          </p>
          <p className="text-lg text-gray-700">
            <strong>WhatsApp:</strong> <a href="https://wa.me/6285136336006" className="text-purple-700 hover:underline">0851-3633-6006</a>
          </p>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="bg-blue-700 text-white text-center py-5 mt-auto shadow-inner">
        <p className="text-sm tracking-wide">
          &copy; {new Date().getFullYear()} Goku Komunika | Dibuat oleh Raya Rizkyana. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
