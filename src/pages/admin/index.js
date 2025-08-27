import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../../firebase/config';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import DeleteAllStockButton from "@/components/admin/DeleteAllStockButton";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  increment
} from 'firebase/firestore';

export default function AdminDashboard() {
  // State management
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [stokBarang, setStokBarang] = useState([]);
  const [newBarang, setNewBarang] = useState({ 
    kode_barang: '',
    nama_barang: '',
    qty: 0,
    terpakai: 0,
    harga_beli: 0,
    harga_jual: 0 
  });
  const [editing, setEditing] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [newService, setNewService] = useState({
    namaPelanggan: '',
    merkHP: '',
    kerusakan: '',
    biaya: 0,
    status: 'Menunggu Konfirmasi',
    sparepartsUsed: []
  });
  const [activeTab, setActiveTab] = useState('service');
  const [isMobile, setIsMobile] = useState(false);
  const [searchSparepart, setSearchSparepart] = useState('');
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const router = useRouter();

  const handleUpdateBiaya = async (id, biayaBaru) => {
  try {
    const serviceRef = doc(db, "service", id);
    await updateDoc(serviceRef, { biaya: Number(biayaBaru) });
    setServices(prev =>
      prev.map(service =>
        service.id === id ? { ...service, biaya: Number(biayaBaru) } : service
      )
    );
    console.log("Biaya berhasil diperbarui:", biayaBaru);
  } catch (error) {
    console.error("Gagal update biaya:", error);
  }
};

  // Filter sparepart berdasarkan pencarian
  const filteredSpareparts = stokBarang
    .filter(item => item.nama_barang.toLowerCase().includes(searchSparepart.toLowerCase()))
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  const filteredStokBarang = stokBarang
    .filter(item => 
      item.nama_barang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kode_barang.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Cek ukuran layar
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cek auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/login');
      else {
        setUser(currentUser);
        fetchData();
      }
    });
    return () => unsubscribe();
  }, []);

  // Ambil data
  const fetchData = async () => {
    try {
      const [serviceSnapshot, stokSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'service'), orderBy('tanggalMasuk', 'desc'))),
        getDocs(collection(db, 'stok'))
      ]);

      setServices(serviceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        sparepartsUsed: doc.data().sparepartsUsed || [],
        formattedDate: doc.data().tanggalMasuk?.toDate?.().toLocaleString('id-ID') || '-'
      })));

      const sortedStok = stokSnapshot.docs
        .map(doc => ({
          id: doc.id, 
          ...doc.data(),
          sisa: (doc.data().qty || 0) - (doc.data().terpakai || 0),
          keuntungan: (doc.data().harga_jual || 0) - (doc.data().harga_beli || 0)
        }))
        .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      
      setStokBarang(sortedStok);
    } catch (error) {
      console.error("Error fetching data:", error);
      setServices([]);
      setStokBarang([]);
    }
  };

  // Fungsi untuk update stok
  const deleteAllStock = async () => {
    if (!confirm("Yakin ingin menghapus semua barang?")) return;

    try {
      const snapshot = await getDocs(collection(db, "stok"));
      const deletePromises = snapshot.docs.map((d) =>
        deleteDoc(doc(db, "stok", d.id))
      );
      await Promise.all(deletePromises);

      alert("Semua barang berhasil dihapus");
      fetchData();
    } catch (error) {
      console.error("Error deleting stock:", error);
      alert("Gagal menghapus barang");
    }
  };

  const updateStok = async (spareparts, operation = 'decrement') => {
  const multiplier = operation === 'decrement' ? -1 : 1;
  
  try {
    const promises = spareparts.map(async (item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) return;

      const sparepartRef = doc(db, 'stok', sparepart.id);
      await updateDoc(sparepartRef, {
        qty: increment(multiplier * Number(item.qty)),
        terpakai: increment(-multiplier * Number(item.qty))
      });
    });

    await Promise.all(promises);
    return true;
  } catch (error) {
    console.error("Error updating stock:", error);
    return false;
  }
};

  // Tambah service baru
  const handleAddService = async () => {
    if (!newService.namaPelanggan || !newService.merkHP) {
      alert('Nama Pelanggan dan Merk HP wajib diisi!');
      return;
    }

    const validSpareparts = newService.sparepartsUsed
      .filter(item => item.nama && item.qty > 0)
      .map(item => ({
        nama: item.nama,
        qty: Number(item.qty)
      }));

    // Validasi stok
    for (const item of validSpareparts) {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) {
        alert(`Sparepart ${item.nama} tidak ditemukan!`);
        return;
      }
      if ((sparepart.qty - sparepart.terpakai) < item.qty) {
        alert(`Stok ${item.nama} tidak mencukupi! Tersedia: ${sparepart.qty - sparepart.terpakai}`);
        return;
      }
    }

    try {
      // Kurangi stok
      const stockUpdated = await updateStok(validSpareparts, 'decrement');
      if (!stockUpdated) throw new Error("Gagal update stok");

      // Hitung total biaya
      const sparepartsCost = validSpareparts.reduce((sum, item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        return sum + (sparepart?.harga_jual || 0) * item.qty;
      }, 0);

      // Tambahkan service
      await addDoc(collection(db, 'service'), {
        ...newService,
        biaya: Number(newService.biaya) + sparepartsCost,
        sparepartsUsed: validSpareparts,
        tanggalMasuk: serverTimestamp(),
        userId: user.uid
      });

      // Reset form
      setNewService({
        namaPelanggan: '',
        merkHP: '',
        kerusakan: '',
        biaya: 0,
        status: 'Menunggu Konfirmasi',
        sparepartsUsed: []
      });
      setSearchSparepart('');
      fetchData();
    } catch (error) {
      console.error("Error adding service:", error);
      alert(`Gagal menambahkan service: ${error.message}`);
    }
  };

  // Fungsi untuk stok barang
  const handleAddBarang = async () => {
    if (!newBarang.kode_barang || !newBarang.nama_barang || newBarang.qty < 0) {
      alert('Kode barang, nama barang dan stok harus diisi!');
      return;
    }
    
    try {
      await addDoc(collection(db, 'stok'), {
        ...newBarang,
        kode_barang: newBarang.kode_barang.trim(),
        nama_barang: newBarang.nama_barang.trim(),
        qty: Number(newBarang.qty),
        terpakai: Number(newBarang.terpakai),
        harga_beli: Number(newBarang.harga_beli),
        harga_jual: Number(newBarang.harga_jual),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      setNewBarang({ 
        kode_barang: '',
        nama_barang: '',
        qty: 0,
        terpakai: 0,
        harga_beli: 0,
        harga_jual: 0 
      });
      fetchData();
    } catch (error) {
      console.error("Error adding item:", error);
      alert(`Gagal menambahkan barang: ${error.message}`);
    }
  };

  const handleUpdateBarang = async () => {
    try {
      await updateDoc(doc(db, 'stok', editing.id), {
        kode_barang: editing.kode_barang.trim(),
        nama_barang: editing.nama_barang.trim(),
        qty: Number(editing.qty),
        terpakai: Number(editing.terpakai),
        harga_beli: Number(editing.harga_beli),
        harga_jual: Number(editing.harga_jual),
        updated_at: serverTimestamp()
      });
      setEditing(null);
      fetchData();
    } catch (error) {
      console.error("Error updating item:", error);
      alert(`Gagal mengupdate barang: ${error.message}`);
    }
  };

  const handleDeleteBarang = async (id) => {
    if (confirm('Hapus barang ini?')) {
      try {
        await deleteDoc(doc(db, 'stok', id));
        fetchData();
      } catch (error) {
        console.error("Error deleting item:", error);
      }
    }
  };

  // Bulk add functionality
  const handleBulkAdd = async () => {
    const lines = bulkData.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
      alert("Format tidak valid. Minimal harus ada header dan 1 data");
      return;
    }

    const headers = lines[0].split('\t');
    const requiredHeaders = ['Kode Barang', 'Nama Barang', 'Qty', 'Harga Beli', 'Harga Jual'];
    
    if (!requiredHeaders.every(h => headers.includes(h))) {
      alert(`Header harus mengandung: ${requiredHeaders.join(', ')}`);
      return;
    }

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      if (values.length !== headers.length) continue;

      const item = {};
      headers.forEach((header, index) => {
        item[header.toLowerCase().replace(' ', '_')] = values[index].trim();
      });

      items.push({
        kode_barang: item.kode_barang,
        nama_barang: item.nama_barang,
        qty: Number(item.qty) || 0,
        terpakai: 0,
        harga_beli: Number(item.harga_beli) || 0,
        harga_jual: Number(item.harga_jual) || 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    }

    if (items.length === 0) {
      alert("Tidak ada data yang valid untuk dimasukkan");
      return;
    }

    try {
      const batch = writeBatch(db);
      items.forEach(item => {
        const docRef = doc(collection(db, 'stok'));
        batch.set(docRef, item);
      });

      await batch.commit();
      alert(`${items.length} barang berhasil ditambahkan`);
      setBulkData('');
      setBulkAddMode(false);
      fetchData();
    } catch (error) {
      console.error("Error bulk adding items:", error);
      alert(`Gagal menambahkan barang: ${error.message}`);
    }
  };

  const handleEditSpareparts = async () => {
  if (!editingService) return;

  const oldService = services.find(s => s.id === editingService.id);
  if (!oldService) {
    alert('Service tidak ditemukan!');
    return;
  }

  // Normalisasi data sparepart baru
  const newSpareparts = editingService.sparepartsUsed
    .filter(item => item.nama && item.qty > 0)
    .map(item => ({
      nama: item.nama,
      nama_barang: item.nama, // Tambahkan field yang sesuai dengan koleksi stok
      qty: Number(item.qty)
    }));

  // Validasi stok baru
  for (const item of newSpareparts) {
    const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
    if (!sparepart) {
      alert(`Sparepart "${item.nama}" tidak ditemukan!`);
      return;
    }

    const oldItem = oldService.sparepartsUsed.find(sp => sp.nama === item.nama);
    const oldQty = oldItem ? oldItem.qty : 0;
    const stokTersedia = sparepart.qty + oldQty - item.qty;

    if (stokTersedia < 0) {
      alert(`Stok "${item.nama}" tidak mencukupi! Tersedia: ${sparepart.qty}, Dibutuhkan: ${item.qty}, Stok akan menjadi: ${stokTersedia}`);
      return;
    }
  }

  try {
    // 1. Kembalikan stok lama
    const returnPromises = oldService.sparepartsUsed.map(async (item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) return;
      
      const sparepartRef = doc(db, 'stok', sparepart.id);
      await updateDoc(sparepartRef, {
        qty: increment(Number(item.qty)),
        terpakai: increment(-Number(item.qty))
      });
    });

    await Promise.all(returnPromises);

    // 2. Kurangi stok baru
    const deductPromises = newSpareparts.map(async (item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      if (!sparepart) return;
      
      const sparepartRef = doc(db, 'stok', sparepart.id);
      await updateDoc(sparepartRef, {
        qty: increment(-Number(item.qty)),
        terpakai: increment(Number(item.qty))
      });
    });

    await Promise.all(deductPromises);

    // 3. Update service
    await updateDoc(doc(db, 'service', editingService.id), {
      sparepartsUsed: newSpareparts,
      tanggalUpdate: serverTimestamp()
    });

    // Refresh data
    setEditingService(null);
    setSearchSparepart('');
    fetchData();
    alert('Perubahan sparepart berhasil disimpan!');
    
  } catch (error) {
    console.error("Error updating spareparts:", error);
    alert(`Gagal update sparepart: ${error.message}`);
    
    // Coba restore stok jika error
    try {
      const restorePromises = oldService.sparepartsUsed.map(async (item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (!sparepart) return;
        
        const sparepartRef = doc(db, 'stok', sparepart.id);
        await updateDoc(sparepartRef, {
          qty: increment(-Number(item.qty)),
          terpakai: increment(Number(item.qty))
        });
      });
      await Promise.all(restorePromises);
    } catch (restoreError) {
      console.error("Gagal restore stok:", restoreError);
    }
  }
};

  // Fungsi untuk menghapus service
  const handleDeleteService = async (id) => {
    if (!confirm('Hapus service ini? Stok sparepart akan dikembalikan.')) return;
    
    try {
      const service = services.find(s => s.id === id);
      if (!service) return;

      // Kembalikan stok
      if (service.sparepartsUsed?.length > 0) {
        await updateStok(service.sparepartsUsed, 'increment');
      }

      // Hapus service
      await deleteDoc(doc(db, 'service', id));
      fetchData();
    } catch (error) {
      console.error("Error deleting service:", error);
      alert(`Gagal menghapus service: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4 md:p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-4 mb-6 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard Admin</h1>
            <p className="text-blue-100">Selamat datang, {user?.email}</p>
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="bg-white text-blue-600 px-4 py-2 rounded-lg font-medium hover:bg-blue-50 transition-all shadow-md w-full md:w-auto"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tab Navigasi */}
      <div className="bg-white rounded-xl p-1 mb-6 shadow-md flex overflow-x-auto">
        <button
          className={`px-6 py-3 font-medium rounded-lg whitespace-nowrap transition-all ${activeTab === 'service' ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('service')}
        >
          <i className="fas fa-tools mr-2"></i>Manajemen Service
        </button>
        <button
          className={`px-6 py-3 font-medium rounded-lg whitespace-nowrap transition-all ${activeTab === 'stok' ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('stok')}
        >
          <i className="fas fa-boxes mr-2"></i>Manajemen Stok
        </button>
      </div>

      {activeTab === 'service' ? (
        <>
          {/* Form Tambah Service */}
          <section className="mb-6 p-6 bg-gradient-to-br from-white to-blue-50 rounded-xl shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-blue-800 flex items-center">
              <i className="fas fa-plus-circle mr-2"></i>Tambah Servis Baru
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Nama Pelanggan*</label>
                <input
                  type="text"
                  value={newService.namaPelanggan}
                  onChange={(e) => setNewService({...newService, namaPelanggan: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Merk HP*</label>
                <input
                  type="text"
                  value={newService.merkHP}
                  onChange={(e) => setNewService({...newService, merkHP: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-blue-700">Kerusakan</label>
                <textarea
                  value={newService.kerusakan}
                  onChange={(e) => setNewService({...newService, kerusakan: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Biaya Service (Rp)</label>
                <input
                  type="number"
                  value={newService.biaya}
                  onChange={(e) => setNewService({
                    ...newService, 
                    biaya: Math.max(0, Number(e.target.value))
                  })}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-blue-700">Status</label>
                <select
                  value={newService.status}
                  onChange={(e) => setNewService({...newService, status: e.target.value})}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                >
                  <option value="Menunggu Konfirmasi">Menunggu</option>
                  <option value="Dalam Proses">Proses</option>
                  <option value="Sudah Selesai">Selesai</option>
                  <option value="Batal">Batal</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-blue-700">Sparepart Digunakan</label>
                
                {/* Input Pencarian Sparepart */}
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Cari sparepart..."
                    value={searchSparepart}
                    onChange={(e) => setSearchSparepart(e.target.value)}
                    className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  {newService.sparepartsUsed.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center p-3 bg-blue-50 rounded-lg">
                      <select
                        value={item.nama}
                        onChange={(e) => {
                          const updated = [...newService.sparepartsUsed];
                          updated[index].nama = e.target.value;
                          setNewService({...newService, sparepartsUsed: updated});
                        }}
                        className="flex-1 p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      >
                        <option value="">Pilih Sparepart</option>
                        {filteredSpareparts.map(sp => (
                          <option key={sp.id} value={sp.nama_barang}>
                            {sp.nama_barang} (Stok: {sp.qty - sp.terpakai}, Harga: Rp {sp.harga_jual?.toLocaleString('id-ID')})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => {
                          const updated = [...newService.sparepartsUsed];
                          updated[index].qty = Math.max(1, Number(e.target.value));
                          setNewService({...newService, sparepartsUsed: updated});
                        }}
                        className="w-20 p-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        min="1"
                      />
                      <button
                        onClick={() => {
                          setNewService({
                            ...newService,
                            sparepartsUsed: newService.sparepartsUsed.filter((_, i) => i !== index)
                          });
                        }}
                        className="text-red-500 px-2 hover:text-red-700 transition-colors"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      setNewService({
                        ...newService,
                        sparepartsUsed: [...newService.sparepartsUsed, { nama: '', qty: 1 }]
                      });
                    }}
                    className="text-blue-600 font-medium text-sm flex items-center gap-2 mt-2 p-2 hover:bg-blue-100 rounded-lg transition-all"
                  >
                    <i className="fas fa-plus-circle"></i> Tambah Sparepart
                  </button>
                </div>
              </div>
            </div>
            <button 
              onClick={handleAddService}
              className="mt-4 bg-gradient-to-r from-green-500 to-teal-500 text-white px-6 py-3 rounded-lg font-medium hover:from-green-600 hover:to-teal-600 transition-all shadow-md hover:shadow-lg flex items-center"
            >
              <i className="fas fa-save mr-2"></i> Tambah Servis
            </button>
          </section>

          {/* Tabel Service */}
          <section className="mb-10 bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <i className="fas fa-list mr-2"></i>Daftar Service
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-blue-100 to-purple-100">
                    <th className="p-3 border-b border-blue-200 text-center text-blue-800">No</th>
                    {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Pelanggan</th>}
                    {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Merk HP</th>}
                    {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Kerusakan</th>}
                    {!isMobile && <th className="p-3 border-b border-blue-200 text-blue-800">Sparepart Digunakan</th>}
                    <th className="p-3 border-b border-blue-200 text-center text-blue-800">Biaya</th>
                    <th className="p-3 border-b border-blue-200 text-center text-blue-800">Status</th>
                    <th className="p-3 border-b border-blue-200 text-center text-blue-800">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {services && services.length > 0 ? (
                    services.map((service, index) => (
                      <tr key={service.id} className={
                        service.status === 'Sudah Selesai' ? 'bg-green-50 hover:bg-green-100' : 
                        service.status === 'Batal' ? 'bg-red-50 hover:bg-red-100' : 
                        'bg-blue-50 hover:bg-blue-100'
                      }>
                        <td className="p-3 border-b border-blue-100 text-center">{index + 1}</td>
                        
                        {!isMobile && (
                          <>
                            <td className="p-3 border-b border-blue-100">{service.namaPelanggan}</td>
                            <td className="p-3 border-b border-blue-100">{service.merkHP}</td>
                            <td className="p-3 border-b border-blue-100">{service.kerusakan}</td>
                            <td className="p-3 border-b border-blue-100">
                              {editingService?.id === service.id ? (
                                <div className="space-y-2">
                                  {/* Input Pencarian untuk Edit */}
                                  <input
                                    type="text"
                                    placeholder="Cari sparepart..."
                                    value={searchSparepart}
                                    onChange={(e) => setSearchSparepart(e.target.value)}
                                    className="w-full p-2 border border-blue-200 rounded text-sm"
                                  />
                                  
                                  {editingService.sparepartsUsed.map((item, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                      <select
                                        value={item.nama}
                                        onChange={(e) => {
                                          const updated = [...editingService.sparepartsUsed];
                                          updated[i].nama = e.target.value;
                                          setEditingService({...editingService, sparepartsUsed: updated});
                                        }}
                                        className="flex-1 p-2 border border-blue-200 rounded text-sm"
                                      >
                                        <option value="">Pilih Sparepart</option>
                                        {filteredSpareparts.map(sp => (
                                          <option key={sp.id} value={sp.nama_barang}>
                                            {sp.nama_barang} (Stok: {sp.qty - sp.terpakai}, Harga: Rp {sp.harga_jual?.toLocaleString('id-ID')})
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="number"
                                        value={item.qty}
                                        onChange={(e) => {
                                          const updated = [...editingService.sparepartsUsed];
                                          updated[i].qty = Math.max(1, Number(e.target.value));
                                          setEditingService({...editingService, sparepartsUsed: updated});
                                        }}
                                        className="w-16 p-2 border border-blue-200 rounded text-sm"
                                        min="1"
                                      />
                                      <button
                                        onClick={() => {
                                          setEditingService({
                                            ...editingService,
                                            sparepartsUsed: editingService.sparepartsUsed.filter((_, idx) => idx !== i)
                                          });
                                        }}
                                        className="text-red-500 px-1 hover:text-red-700"
                                      >
                                        <i className="fas fa-times"></i>
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => {
                                      setEditingService({
                                        ...editingService,
                                        sparepartsUsed: [...editingService.sparepartsUsed, { nama: '', qty: 1 }]
                                      });
                                    }}
                                    className="text-blue-500 text-xs flex items-center gap-1 hover:text-blue-700"
                                  >
                                    <i className="fas fa-plus"></i> Tambah
                                  </button>
                                </div>
                              ) : (
                                <ul className="text-sm">
                                  {service.sparepartsUsed?.map((item, i) => (
                                    <li key={i} className="mb-1">
                                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                        {item.nama} (x{item.qty})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </>
                        )}
                        
                       <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        <input
                         type="number"
                         value={service.biaya || ''}
                         onChange={(e) => handleUpdateBiaya(service.id, e.target.value)}
                         className="border rounded px-2 py-1 w-24 text-right focus:ring focus:ring-blue-300"
                         placeholder="0"
                        />
                        </td>
  
                        <td className="p-3 border-b border-blue-100 text-center">
                          <select
                            value={service.status}
                            onChange={(e) => updateDoc(doc(db, 'service', service.id), {
                              status: e.target.value,
                              tanggalUpdate: serverTimestamp()
                            }).then(fetchData)}
                            className={`border px-3 py-1 rounded-full text-xs md:text-sm font-medium ${
                              service.status === 'Sudah Selesai' ? 'bg-green-100 text-green-800 border-green-300' :
                              service.status === 'Batal' ? 'bg-red-100 text-red-800 border-red-300' :
                              service.status === 'Dalam Proses' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                              'bg-blue-100 text-blue-800 border-blue-300'
                            }`}
                          >
                            <option value="Menunggu Konfirmasi">Menunggu</option>
                            <option value="Dalam Proses">Proses</option>
                            <option value="Sudah Selesai">Selesai</option>
                            <option value="Batal">Batal</option>
                          </select>
                        </td>
                        
                        <td className="p-3 border-b border-blue-100 text-center">
                           {editingService?.id === service.id ? (
        <div className="flex gap-2 justify-center">
          <button
            onClick={handleEditSpareparts}
            className="bg-green-500 text-white px-3 py-1 rounded-full text-xs hover:bg-green-600 transition-colors"
          >
            <i className="fas fa-check mr-1"></i> Simpan
          </button>
          <button
            onClick={() => {
              setEditingService(null);
              setSearchSparepart('');
            }}
            className="bg-gray-500 text-white px-3 py-1 rounded-full text-xs hover:bg-gray-600 transition-colors"
          >
            <i className="fas fa-times mr-1"></i> Batal
          </button>
        </div>
      ) : (
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setEditingService(service)}
            className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs hover:bg-blue-600 transition-colors"
          >
            <i className="fas fa-edit mr-1"></i> Edit
          </button>
          <button
            onClick={() => handleDeleteService(service.id)}
            className="bg-red-500 text-white px-3 py-1 rounded-full text-xs hover:bg-red-600 transition-colors"
          >
            <i className="fas fa-trash mr-1"></i> Hapus
          </button>
        </div>
      )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-500">
                        <i className="fas fa-inbox text-4xl mb-3 text-blue-300"></i>
                        <p>Tidak ada data service</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* Tab Stok Barang */
        <>
          <section className="mb-6 p-4 bg-gray-100 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">
              {editing ? 'Edit Barang' : 
               bulkAddMode ? 'Tambah Barang Massal' : 'Tambah Barang'}
            </h2>

            {bulkAddMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Format (Copy dari Excel/Spreadsheet):
                  </label>
                  <textarea
                    value={bulkData}
                    onChange={(e) => setBulkData(e.target.value)}
                    className="w-full p-2 border rounded h-40 font-mono text-sm"
                    placeholder={`Kode Barang\tNama Barang\tQty\tHarga Beli\tHarga Jual\nPRB-VV621\tPERNIK RUBBER VOL VIVO Y15S BLUE\t3\t1650\t2500\nPRB-VV622\tPERNIK RUBBER VOL VIVO Y15S GREEN\t3\t1650\t2500`}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkAdd}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                  >
                    Tambah Massal
                  </button>
                  <button
                    onClick={() => {
                      setBulkAddMode(false);
                      setBulkData('');
                    }}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Kode Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.kode_barang : newBarang.kode_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, kode_barang: e.target.value}) 
                          : setNewBarang({...newBarang, kode_barang: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Nama Barang*</label>
                    <input
                      type="text"
                      value={editing ? editing.nama_barang : newBarang.nama_barang}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, nama_barang: e.target.value}) 
                          : setNewBarang({...newBarang, nama_barang: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Qty*</label>
                    <input
                      type="number"
                      value={editing ? editing.qty : newBarang.qty}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, qty: e.target.value}) 
                          : setNewBarang({...newBarang, qty: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Harga Beli (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_beli : newBarang.harga_beli}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_beli: e.target.value}) 
                          : setNewBarang({...newBarang, harga_beli: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Harga Jual (Rp)*</label>
                    <input
                      type="number"
                      value={editing ? editing.harga_jual : newBarang.harga_jual}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, harga_jual: e.target.value}) 
                          : setNewBarang({...newBarang, harga_jual: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Terpakai</label>
                    <input
                      type="number"
                      value={editing ? editing.terpakai : newBarang.terpakai}
                      onChange={(e) => 
                        editing 
                          ? setEditing({...editing, terpakai: e.target.value}) 
                          : setNewBarang({...newBarang, terpakai: e.target.value})
                      }
                      className="w-full p-2 border rounded"
                      min="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {editing ? (
                    <>
                      <button
                        onClick={handleUpdateBarang}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleAddBarang}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                      >
                        Tambah
                      </button>
                      <button
                        onClick={() => setBulkAddMode(true)}
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
                      >
                        Tambah Banyak Produk
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <section>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-2">
              <h2 className="text-lg font-semibold">Daftar Stok Barang</h2>
              <div className="flex gap-2 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Cari barang..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full md:w-64 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <DeleteAllStockButton onDelete={deleteAllStock} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="p-2 border">No</th>
                    <th className="p-2 border">Kode Barang</th>
                    <th className="p-2 border">Nama Barang</th>
                    <th className="p-2 border text-center">Qty</th>
                    <th className="p-2 border text-center">Terpakai</th>
                    <th className="p-2 border text-center">Sisa</th>
                    <th className="p-2 border text-center">Harga Beli</th>
                    <th className="p-2 border text-center">Harga Jual</th>
                    <th className="p-2 border text-center">Keuntungan</th>
                    <th className="p-2 border text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStokBarang.length > 0 ? (
                    filteredStokBarang.map((item, index) => (
                      <tr key={item.id} className="bg-white">
                        <td className="p-2 border">{index + 1}</td>
                        <td className="p-2 border">{item.kode_barang}</td>
                        <td className="p-2 border">{item.nama_barang}</td>
                        <td className="p-2 border text-center">{item.qty}</td>
                        <td className="p-2 border text-center">{item.terpakai}</td>
                        <td className="p-2 border text-center">{item.qty - item.terpakai}</td>
                        <td className="p-2 border text-center">
                          Rp {item.harga_beli?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-2 border text-center">
                          Rp {item.harga_jual?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className={`p-2 border text-center ${
                          (item.harga_jual - item.harga_beli) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Rp {(item.harga_jual - item.harga_beli)?.toLocaleString('id-ID') || '0'}
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            onClick={() =>
                              setEditing({
                                id: item.id,
                                kode_barang: item.kode_barang,
                                nama_barang: item.nama_barang,
                                qty: item.qty,
                                terpakai: item.terpakai,
                                harga_beli: item.harga_beli,
                                harga_jual: item.harga_jual
                              })
                            }
                            className="text-blue-500 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteBarang(item.id)}
                            className="text-red-500"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="p-4 text-center">
                        {searchTerm
                          ? 'Barang tidak ditemukan'
                          : 'Tidak ada data stok barang'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}