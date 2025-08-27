import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../../firebase/config';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function PelangganPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [namaPelanggan, setNamaPelanggan] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newService, setNewService] = useState({
    merkHP: '',
    kerusakan: '',
    kelengkapan: '',
    keteranganTambahan: ''
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setUser(currentUser);
      
      try {
        // 1. Ambil data user dari Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          setNamaPelanggan(userData.nama);

          // 2. Setup realtime listener untuk service pelanggan ini
          const q = query(
            collection(db, 'service'),
            where('userId', '==', currentUser.uid)
          );

          const unsubscribeService = onSnapshot(q, (querySnapshot) => {
            const serviceData = querySnapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                merkHP: data.merkHP || '-',
                kerusakan: data.kerusakan || '-',
                biaya: data.biaya || 0,
                status: data.status || 'Menunggu Konfirmasi',
                tanggalMasuk: data.tanggalMasuk?.toDate 
                  ? data.tanggalMasuk.toDate().toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Tanggal tidak tersedia',
                sparepart: data.sparepart || []
              };
            });

            serviceData.sort((a, b) => {
              const dateA = a.tanggalMasuk;
              const dateB = b.tanggalMasuk;
              return new Date(dateB) - new Date(dateA);
            });

            setServices(serviceData);
            setLoading(false);
          });

          return () => unsubscribeService();
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Fungsi logout yang sebelumnya hilang
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewService(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmitService = async (e) => {
    e.preventDefault();
    
    if (!newService.merkHP || !newService.kerusakan) {
      alert('Merk HP dan Kerusakan wajib diisi!');
      return;
    }

    try {
      await addDoc(collection(db, 'service'), {
        namaPelanggan: namaPelanggan,
        merkHP: newService.merkHP,
        kerusakan: newService.kerusakan,
        kelengkapan: newService.kelengkapan,
        keteranganTambahan: newService.keteranganTambahan,
        status: 'Menunggu Konfirmasi',
        biaya: 0,
        tanggalMasuk: serverTimestamp(),
        userId: user.uid
      });

      alert('Service berhasil diajukan! Admin akan menghubungi Anda untuk konfirmasi.');
      setNewService({
        merkHP: '',
        kerusakan: '',
        kelengkapan: '',
        keteranganTambahan: ''
      });
      setShowForm(false);
    } catch (error) {
      console.error('Error submitting service:', error);
      alert('Gagal mengajukan service. Silakan coba lagi.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Memuat data service...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-100 to-purple-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Goku Komunika - Service HP</h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowForm(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm"
            >
              Ajukan Service
            </button>
            <button 
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-6 max-w-6xl mx-auto w-full">
        {/* Form Ajukan Service */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Formulir Service HP</h3>
              <form onSubmit={handleSubmitService}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Merk HP*</label>
                  <input
                    type="text"
                    name="merkHP"
                    value={newService.merkHP}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                    placeholder="Contoh: Xiaomi Redmi Note 10"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kerusakan*</label>
                  <textarea
                    name="kerusakan"
                    value={newService.kerusakan}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                    placeholder="Jelaskan kerusakan yang dialami"
                    rows={3}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kelengkapan</label>
                  <input
                    type="text"
                    name="kelengkapan"
                    value={newService.kelengkapan}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                    placeholder="Contoh: Charger, Box, Dus"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan Tambahan</label>
                  <textarea
                    name="keteranganTambahan"
                    value={newService.keteranganTambahan}
                    onChange={handleInputChange}
                    className="w-full p-2 border rounded"
                    placeholder="Informasi tambahan yang perlu diketahui teknisi"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Ajukan Service
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tabel Riwayat Service */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">
            Halo, {namaPelanggan} 👋
          </h2>
          
          {services.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Anda belum memiliki riwayat service</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merk HP</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kerusakan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Biaya</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Masuk</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {services.map((service, index) => (
                    <tr key={service.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {service.merkHP}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {service.kerusakan}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
  {service.biaya && !isNaN(Number(service.biaya))
    ? `Rp ${Number(service.biaya).toLocaleString('id-ID')}`
    : 'Menunggu konfirmasi'}
</td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          service.status === 'Sudah Selesai' 
                            ? 'bg-green-100 text-green-800' 
                            : service.status === 'Batal' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {service.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {service.tanggalMasuk}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-8">
        <div className="max-w-6xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Goku Komunika - Service HP Profesional
        </div>
      </footer>
    </div>
  );
}