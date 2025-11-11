import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Phone, Wrench, ShoppingBag, Info, Mail, Search, Clock, CheckCircle, XCircle, AlertCircle, List } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export default function HomePage() {
  const [isOpen, setIsOpen] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [serviceData, setServiceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTracking, setShowTracking] = useState(false);
  const [stokBarang, setStokBarang] = useState([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogData, setCatalogData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Ambil data stok barang saat komponen dimuat
  useEffect(() => {
    const fetchStokBarang = async () => {
      try {
        const stokSnapshot = await getDocs(collection(db, 'stok'));
        const stokData = stokSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStokBarang(stokData);
        
        // Set catalog data langsung dari stok barang
        setCatalogData(stokData);
      } catch (error) {
        console.error('Error fetching stock data:', error);
      }
    };

    fetchStokBarang();
  }, []);

  // Filter data katalog berdasarkan pencarian
  const filteredCatalog = catalogData.filter(item => 
    item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.kode_barang.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fungsi untuk menampilkan section katalog
  const handleShowCatalog = () => {
    setShowCatalog(true);
    // Scroll ke section katalog
    setTimeout(() => {
      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Fungsi untuk mencari service berdasarkan ID
  const searchService = async () => {
    if (!serviceId.trim()) {
      setError('Masukkan ID Service terlebih dahulu');
      return;
    }

    setLoading(true);
    setError('');
    setServiceData(null);

    try {
      // Cari service berdasarkan serviceId
      const q = query(
        collection(db, 'service'), 
        where('serviceId', '==', serviceId.toUpperCase())
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError('ID Service tidak ditemukan. Pastikan ID yang dimasukkan benar.');
        setLoading(false);
        return;
      }

      // Ambil data service pertama yang ditemukan
      const serviceDoc = querySnapshot.docs[0];
      const data = serviceDoc.data();
      
      // Hitung total biaya yang benar (biaya service + biaya sparepart harga jual)
      const biayaService = data.biaya || 0;
      
      // Hitung biaya sparepart berdasarkan harga jual
      const biayaSparepart = data.sparepartsUsed?.reduce((total, item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (sparepart) {
          return total + (sparepart.harga_jual * item.qty);
        }
        return total;
      }, 0) || 0;
      
      const totalBiaya = biayaService + biayaSparepart;
      
      setServiceData({
        id: serviceDoc.id,
        ...data,
        formattedDate: data.tanggalMasuk?.toDate?.().toLocaleString('id-ID') || '-',
        totalBiaya: totalBiaya,
        biayaService: biayaService,
        biayaSparepart: biayaSparepart
      });
      
    } catch (err) {
      console.error('Error searching service:', err);
      setError('Terjadi kesalahan saat mencari service. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetSearch = () => {
    setServiceId('');
    setServiceData(null);
    setError('');
  };

  // Fungsi untuk menampilkan section tracking
  const handleShowTracking = () => {
    setShowTracking(true);
    setShowCatalog(false);
    // Scroll ke section tracking
    setTimeout(() => {
      document.getElementById('tracking')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Fungsi untuk mendapatkan warna status
  const getStatusColor = (status) => {
    switch (status) {
      case 'Sudah Selesai':
        return 'text-green-700 bg-green-50 border border-green-200';
      case 'Batal':
        return 'text-red-700 bg-red-50 border border-red-200';
      case 'Dalam Proses':
        return 'text-amber-700 bg-amber-50 border border-amber-200';
      case 'Menunggu Konfirmasi':
        return 'text-blue-700 bg-blue-50 border border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border border-gray-200';
    }
  };

  // Fungsi untuk mendapatkan icon status
  const getStatusIcon = (status) => {
    switch (status) {
      case 'Sudah Selesai':
        return <CheckCircle className="w-5 h-5" />;
      case 'Batal':
        return <XCircle className="w-5 h-5" />;
      case 'Dalam Proses':
        return <Clock className="w-5 h-5" />;
      case 'Menunggu Konfirmasi':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  // Fungsi untuk mendapatkan warna berdasarkan jenis sparepart
  const getSparepartColor = (namaBarang) => {
    const nama = namaBarang.toLowerCase();
    
    if (nama.includes('iphone')) {
      return { bg: 'from-blue-50 to-purple-50', badge: 'bg-blue-100 text-blue-800' };
    } else if (nama.includes('samsung')) {
      return { bg: 'from-blue-50 to-cyan-50', badge: 'bg-cyan-100 text-cyan-800' };
    } else if (nama.includes('oppo')) {
      return { bg: 'from-green-50 to-emerald-50', badge: 'bg-green-100 text-green-800' };
    } else if (nama.includes('vivo')) {
      return { bg: 'from-purple-50 to-pink-50', badge: 'bg-purple-100 text-purple-800' };
    } else if (nama.includes('xiaomi') || nama.includes('redmi') || nama.includes('poco')) {
      return { bg: 'from-orange-50 to-red-50', badge: 'bg-orange-100 text-orange-800' };
    } else if (nama.includes('realme')) {
      return { bg: 'from-yellow-50 to-amber-50', badge: 'bg-yellow-100 text-yellow-800' };
    } else if (nama.includes('flexi')) {
      return { bg: 'from-indigo-50 to-purple-50', badge: 'bg-indigo-100 text-indigo-800' };
    } else if (nama.includes('lcd') || nama.includes('layar')) {
      return { bg: 'from-teal-50 to-green-50', badge: 'bg-teal-100 text-teal-800' };
    } else if (nama.includes('baterai')) {
      return { bg: 'from-amber-50 to-orange-50', badge: 'bg-amber-100 text-amber-800' };
    } else {
      return { bg: 'from-gray-50 to-slate-50', badge: 'bg-gray-100 text-gray-800' };
    }
  };

  // Fungsi untuk mendapatkan kategori sparepart dari nama barang
  const getSparepartCategory = (namaBarang) => {
    const nama = namaBarang.toLowerCase();
    
    if (nama.includes('flexi')) return 'Flexi';
    if (nama.includes('lcd') || nama.includes('layar')) return 'LCD/Layar';
    if (nama.includes('baterai')) return 'Baterai';
    if (nama.includes('camera') || nama.includes('kamera')) return 'Kamera';
    if (nama.includes('charging') || nama.includes('port')) return 'Charging Port';
    if (nama.includes('housing') || nama.includes('casing')) return 'Housing';
    if (nama.includes('touchscreen') || nama.includes('touch')) return 'Touchscreen';
    
    return 'Sparepart';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-gray-800 flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-lg z-50 shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">Goku Komunika</h1>
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="focus:outline-none text-blue-600 hover:text-purple-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
            >
              ☰
            </button>
          </div>
          <nav className="hidden md:flex items-center space-x-8 font-medium">
            <button 
              onClick={handleShowTracking}
              className="text-gray-600 hover:text-blue-600 transition-colors duration-200"
            >
              Cek Status Service
            </button>
            <button 
              onClick={handleShowCatalog}
              className="text-gray-600 hover:text-blue-600 transition-colors duration-200"
            >
              Katalog Service
            </button>
            <a href="#profil" className="text-gray-600 hover:text-blue-600 transition-colors duration-200">Profil</a>
            <a href="#tentang" className="text-gray-600 hover:text-blue-600 transition-colors duration-200">Tentang Kami</a>
            <a href="#website" className="text-gray-600 hover:text-blue-600 transition-colors duration-200">Tentang Website</a>
            <a href="#kontak" className="text-gray-600 hover:text-blue-600 transition-colors duration-200">Kontak</a>
            <Link href="/login">
              <span className="ml-4 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-md hover:shadow-lg font-medium">
                Login
              </span>
            </Link>
          </nav>
        </div>
        {/* Mobile Menu */}
        {isOpen && (
          <motion.nav 
            className="md:hidden px-4 pb-4 space-y-3 bg-white/95 backdrop-blur-sm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <button 
              onClick={() => {
                handleShowTracking();
                setIsOpen(false);
              }}
              className="block w-full text-left py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Cek Status Service
            </button>
            <button 
              onClick={() => {
                handleShowCatalog();
                setIsOpen(false);
              }}
              className="block w-full text-left py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Katalog Service
            </button>
            <a 
              href="#profil" 
              className="block py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Profil
            </a>
            <a 
              href="#tentang" 
              className="block py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Tentang Kami
            </a>
            <a 
              href="#website" 
              className="block py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Tentang Website
            </a>
            <a 
              href="#kontak" 
              className="block py-2 px-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Kontak
            </a>
            <Link href="/login">
              <span 
                className="block mt-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl text-center hover:from-blue-600 hover:to-purple-600 transition-all font-medium"
                onClick={() => setIsOpen(false)}
              >
                Login
              </span>
            </Link>
          </motion.nav>
        )}
      </header>

      {/* Content Sections */}
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 space-y-16">
        {/* SECTION BARU: Katalog Service */}
        {showCatalog && (
          <motion.section
            id="catalog"
            className="border border-gray-200 rounded-2xl p-8 shadow-sm bg-white/80 backdrop-blur-sm"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl shadow-md mb-4">
                <List className="text-white w-8 h-8" />
              </div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent mb-3">Katalog Sparepart HP</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Cari dan lihat daftar harga sparepart untuk berbagai jenis HP. Ketik nama sparepart seperti "FLEXI", "LCD", "BATERAI" atau model HP seperti "OPPO RENO 3".
              </p>
            </div>

            {/* Form Pencarian Katalog */}
            <div className="max-w-2xl mx-auto mb-10">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari sparepart (contoh: FLEXI, LCD, OPPO RENO 3, iPhone, dll)"
                  className="flex-1 px-5 py-4 border border-gray-300 rounded-xl focus:ring-3 focus:ring-green-200 focus:border-green-500 transition-all duration-200 text-lg shadow-sm"
                />
                <div className="px-4 py-4 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-xl flex items-center gap-3 shadow-md font-medium">
                  <Search className="w-5 h-5" />
                  <span>Cari</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center">
                {filteredCatalog.length} items ditemukan
              </p>
            </div>

            {/* Hasil Pencarian Katalog */}
            <div className="max-w-6xl mx-auto">
              {catalogLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-600 text-lg">Memuat data katalog...</p>
                </div>
              ) : filteredCatalog.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCatalog.map((item, index) => {
                    const colors = getSparepartColor(item.nama_barang);
                    const category = getSparepartCategory(item.nama_barang);
                    
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
                      >
                        <div className={`p-4 bg-gradient-to-r ${colors.bg}`}>
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-lg font-bold text-gray-800 line-clamp-2">{item.nama_barang}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
                              {category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 font-mono">{item.kode_barang}</p>
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-2xl font-bold text-green-600">
                              Rp {item.harga_jual?.toLocaleString() || '0'}
                            </span>
                            <div className="text-right">
                              <span className={`text-sm font-semibold ${item.qty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Stok: {item.qty || 0}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <div>
                              <span className="font-semibold">Kode:</span>
                              <p className="truncate font-mono">{item.kode_barang}</p>
                            </div>
                            <div>
                              <span className="font-semibold">Kategori:</span>
                              <p className="truncate">{category}</p>
                            </div>
                          </div>
                          {item.terpakai > 0 && (
                            <div className="mt-2 text-xs text-amber-600">
                              <span className="font-semibold">Terpakai: {item.terpakai}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl"
                >
                  <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-amber-800 mb-2">Data Tidak Ditemukan</h3>
                  <p className="text-amber-700">
                    {searchTerm 
                      ? `Tidak ditemukan sparepart untuk "${searchTerm}". Coba kata kunci lain seperti "FLEXI", "LCD", "BATERAI", "OPPO", atau "iPhone".`
                      : 'Masukkan kata kunci pencarian untuk melihat daftar harga sparepart.'
                    }
                  </p>
                </motion.div>
              )}

              {/* Informasi Katalog */}
              {!catalogLoading && filteredCatalog.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-6"
                >
                  <h4 className="font-bold text-blue-800 mb-3 text-lg">Informasi Harga Sparepart:</h4>
                  <ul className="text-blue-700 space-y-2 text-sm">
                    <li className="flex items-center gap-2">• Harga yang ditampilkan adalah harga jual sparepart</li>
                    <li className="flex items-center gap-2">• Biaya service/jasa belum termasuk dalam harga di atas</li>
                    <li className="flex items-center gap-2">• Stok dapat berubah sewaktu-waktu</li>
                    <li className="flex items-center gap-2">• Harga dapat berubah tanpa pemberitahuan sebelumnya</li>
                    <li className="flex items-center gap-2">• Hubungi kami untuk informasi lebih detail dan ketersediaan</li>
                  </ul>
                </motion.div>
              )}
            </div>
          </motion.section>
        )}

        {/* SECTION: Tracking Service - Hanya ditampilkan ketika showTracking true */}
        {showTracking && (
          <motion.section
            id="tracking"
            className="border border-gray-200 rounded-2xl p-8 shadow-sm bg-white/80 backdrop-blur-sm"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-md mb-4">
                <Search className="text-white w-8 h-8" />
              </div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">Cek Status Service HP</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Masukkan ID Service yang diberikan untuk melacak status perbaikan HP Anda secara real-time
              </p>
            </div>

            {/* Form Pencarian */}
            <div className="max-w-2xl mx-auto mb-10">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value.toUpperCase())}
                  placeholder="Masukkan ID Service (contoh: SRV091025001)"
                  className="flex-1 px-5 py-4 border border-gray-300 rounded-xl focus:ring-3 focus:ring-blue-200 focus:border-blue-500 transition-all duration-200 text-lg shadow-sm"
                  onKeyPress={(e) => e.key === 'Enter' && searchService()}
                />
                <button
                  onClick={searchService}
                  disabled={loading}
                  className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 disabled:from-gray-400 disabled:to-gray-400 transition-all duration-200 flex items-center gap-3 shadow-md hover:shadow-lg font-medium"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Mencari...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>Cari</span>
                    </>
                  )}
                </button>
              </div>
              
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </motion.div>
              )}
            </div>

            {/* Hasil Pencarian */}
            {serviceData && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-4xl mx-auto bg-gradient-to-br from-white to-blue-50 rounded-2xl p-8 shadow-lg border border-blue-100"
              >
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Detail Service</h3>
                  <button
                    onClick={resetSearch}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">ID Service</label>
                      <p className="text-xl font-mono font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
                        {serviceData.serviceId}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">Nama Pelanggan</label>
                      <p className="text-xl font-semibold text-gray-800">{serviceData.namaPelanggan}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">Merk HP</label>
                      <p className="text-xl text-gray-800">{serviceData.merkHP}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">Tanggal Masuk</label>
                      <p className="text-xl text-gray-800">{serviceData.formattedDate}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">Kerusakan</label>
                      <p className="text-xl text-gray-800">{serviceData.kerusakan || '-'}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <label className="block text-sm font-semibold text-gray-500 mb-2">Total Biaya</label>
                      <p className="text-2xl font-bold text-green-600">
                        Rp {serviceData.totalBiaya?.toLocaleString() || '0'}
                      </p>
                      {serviceData.biayaService > 0 && serviceData.biayaSparepart > 0 && (
                        <div className="text-sm text-gray-600 mt-1">
                          <div>Biaya Service: Rp {serviceData.biayaService?.toLocaleString()}</div>
                          <div>Biaya Sparepart: Rp {serviceData.biayaSparepart?.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Service */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-gray-500 mb-3">Status Service</label>
                  <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-xl font-semibold border-2 ${getStatusColor(serviceData.status)}`}>
                    {getStatusIcon(serviceData.status)}
                    <span className="text-lg">{serviceData.status}</span>
                  </div>
                </div>

                {/* Sparepart yang Digunakan */}
                {serviceData.sparepartsUsed && serviceData.sparepartsUsed.length > 0 && (
                  <div className="mb-8">
                    <label className="block text-sm font-semibold text-gray-500 mb-3">Sparepart Digunakan</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {serviceData.sparepartsUsed.map((item, index) => {
                        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
                        const hargaSparepart = sparepart?.harga_jual || 0;
                        const subtotal = hargaSparepart * item.qty;
                        
                        return (
                          <div key={index} className="flex justify-between items-center bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div>
                              <span className="font-semibold text-gray-800 block">{item.nama}</span>
                              <span className="text-sm text-gray-600">Rp {hargaSparepart.toLocaleString()} x {item.qty}</span>
                            </div>
                            <span className="text-sm font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                              Rp {subtotal.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Informasi Tambahan */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                  <h4 className="font-bold text-blue-800 mb-3 text-lg">Informasi Penting:</h4>
                  <ul className="text-blue-700 space-y-2">
                    <li className="flex items-center gap-2">• Simpan ID Service ini untuk pengecekan status</li>
                    <li className="flex items-center gap-2">• Hubungi kami jika ada pertanyaan lebih lanjut</li>
                    <li className="flex items-center gap-2">• Service dapat diambil ketika status "Sudah Selesai"</li>
                    <li className="flex items-center gap-2">• Total biaya sudah termasuk biaya service dan sparepart</li>
                  </ul>
                </div>
              </motion.div>
            )}

            {/* Informasi Cara Mendapatkan ID Service */}
            {!serviceData && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto mt-12 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8"
              >
                <h4 className="font-bold text-amber-800 mb-4 text-xl">Cara Mendapatkan ID Service:</h4>
                <ol className="text-amber-700 space-y-3 text-lg">
                  <li className="flex items-center gap-3">1. Bawa HP yang akan diservice ke toko kami</li>
                  <li className="flex items-center gap-3">2. Admin akan membuatkan tiket service dan memberikan ID Service</li>
                  <li className="flex items-center gap-3">3. Simpan ID Service yang diberikan untuk melacak progress perbaikan</li>
                  <li className="flex items-center gap-3">4. Gunakan ID tersebut di form di atas untuk mengecek status</li>
                </ol>
              </motion.div>
            )}
          </motion.section>
        )}

        {/* Profil Toko */}
        <motion.section
          id="profil"
          className="text-center border border-gray-200 rounded-2xl p-12 shadow-sm bg-white/80 backdrop-blur-sm"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-md mb-6">
            <Phone className="text-white w-8 h-8" />
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">Profil Toko</h2>
          <p className="text-xl leading-relaxed text-gray-700 max-w-4xl mx-auto">
            <strong className="text-blue-600">Goku Komunika</strong> adalah pusat layanan dan penjualan handphone yang telah dipercaya masyarakat
            selama bertahun-tahun. Kami menyediakan jasa perbaikan cepat, penjualan berbagai merek HP terbaru,
            dan aksesori lengkap untuk memenuhi semua kebutuhan komunikasi Anda. Dengan mengutamakan <em className="text-purple-600">kecepatan</em>,
            <em className="text-purple-600"> ketepatan</em>, dan <em className="text-purple-600">kepuasan pelanggan</em>, kami menjadi mitra terbaik bagi siapa saja yang ingin
            tetap terhubung tanpa hambatan.
          </p>
        </motion.section>

        {/* Tentang Kami */}
        <motion.section
          id="tentang"
          className="text-center border border-gray-200 rounded-2xl p-12 shadow-sm bg-white/80 backdrop-blur-sm"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-md mb-6">
            <Wrench className="text-white w-8 h-8" />
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">Tentang Kami</h2>
          <p className="text-xl leading-relaxed text-gray-700 max-w-4xl mx-auto">
            Kami berdiri dengan komitmen untuk memberikan solusi terbaik dalam dunia komunikasi. Mulai dari
            perbaikan perangkat yang rusak, penjualan unit baru, hingga menyediakan perlengkapan tambahan
            seperti charger, earphone, dan casing berkualitas. Dengan teknisi berpengalaman dan harga yang
            transparan, setiap layanan yang kami berikan selalu mengutamakan kepercayaan dan kepuasan pelanggan.
          </p>
        </motion.section>

        {/* Tentang Website */}
        <motion.section
          id="website"
          className="text-center border border-gray-200 rounded-2xl p-12 shadow-sm bg-white/80 backdrop-blur-sm"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-md mb-6">
            <ShoppingBag className="text-white w-8 h-8" />
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">Tentang Website</h2>
          <p className="text-xl leading-relaxed text-gray-700 max-w-4xl mx-auto">
            Website ini dirancang sebagai pusat informasi dan sistem manajemen internal untuk Goku Komunika.
            Di sini, pelanggan dapat <strong className="text-blue-600">memantau status perbaikan perangkat</strong> menggunakan ID Service,
            <strong className="text-blue-600"> melihat katalog harga sparepart</strong> berbagai jenis HP, sedangkan admin dapat mengelola stok barang, 
            pencatatan penjualan, dan pengaturan layanan dengan mudah. Desainnya dibuat agar <em className="text-purple-600">user-friendly</em>, 
            responsif, dan dapat diakses kapan saja dari berbagai perangkat.
          </p>
        </motion.section>

        {/* Kontak Kami */}
        <motion.section
          id="kontak"
          className="text-center border border-gray-200 rounded-2xl p-12 shadow-sm bg-white/80 backdrop-blur-sm"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-md mb-6">
            <Mail className="text-white w-8 h-8" />
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-8">Kontak Kami</h2>
          <div className="space-y-4 text-xl text-gray-700 max-w-2xl mx-auto">
            <p>
              <strong className="text-blue-600">Alamat:</strong> Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang
            </p>
            <p>
              <strong className="text-blue-600">WhatsApp:</strong>{' '}
              <a href="https://wa.me/6285136336006" className="text-purple-600 hover:text-purple-700 underline font-semibold transition-colors">
                0851-3633-6006
              </a>
            </p>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-center py-8 mt-auto">
        <p className="text-lg font-medium tracking-wide">
          &copy; {new Date().getFullYear()} Goku Komunika | Dibuat oleh Raya Rizkyana. All rights reserved.
        </p>
      </footer>
    </div>
  );
}