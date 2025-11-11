import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../../firebase/config';
import { signOut, onAuthStateChanged } from 'firebase/auth';
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
  where,
  increment
} from 'firebase/firestore';

export default function TeknisiDashboard() {
  // State management
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [stokBarang, setStokBarang] = useState([]);
  const [newService, setNewService] = useState({
    namaPelanggan: '',
    merkHP: '',
    kerusakan: '',
    biaya: 0,
    status: 'Menunggu Konfirmasi',
    sparepartsUsed: [],
    pembayaran: 0,
    kembalian: 0,
    metodePembayaran: 'bayar_nanti',
    statusPembayaran: 'belum_bayar',
    statusPengambilan: 'belum_diambil'
  });
  const [searchSparepart, setSearchSparepart] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  const router = useRouter();

  // FUNGSI BARU: Generate ID Service dengan fix duplikasi
  const generateServiceId = async () => {
    const today = new Date();
    const dateString = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    try {
      const servicesTodaySnapshot = await getDocs(
        query(
          collection(db, 'service'),
          where('tanggalMasuk', '>=', todayStart),
          where('tanggalMasuk', '<=', todayEnd)
        )
      );

      const sequenceNumber = (servicesTodaySnapshot.size + 1).toString().padStart(3, '0');
      return `SRV${dateString}${sequenceNumber}`;
    } catch (error) {
      console.error('Error generating service ID:', error);
      return `SRV${dateString}${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
    }
  };

  // PERBAIKAN: Hitung total biaya service
  const calculateTotalBiayaService = (service = newService) => {
    const biayaService = service.biaya || 0;
    const biayaSparepart = service.sparepartsUsed?.reduce((total, item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      return total + ((sparepart?.harga_jual || 0) * item.qty);
    }, 0) || 0;
    
    return biayaService + biayaSparepart;
  };

  // PERBAIKAN: Hitung laba dari sparepart
  const calculateLabaSparepart = (service = newService) => {
    return service.sparepartsUsed?.reduce((total, item) => {
      const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
      const hargaBeli = sparepart?.harga_beli || 0;
      const hargaJual = sparepart?.harga_jual || 0;
      return total + ((hargaJual - hargaBeli) * item.qty);
    }, 0) || 0;
  };

  // PERBAIKAN: Hitung kembalian
  const calculateKembalian = (pembayaran, totalHarga) => {
    return Math.max(0, pembayaran - totalHarga);
  };

  // PERBAIKAN: Update pembayaran untuk service
  const handlePembayaranServiceChange = (pembayaran) => {
    const totalBiaya = calculateTotalBiayaService();
    const kembalian = calculateKembalian(pembayaran, totalBiaya);
    
    setNewService({
      ...newService,
      pembayaran: pembayaran,
      kembalian: kembalian
    });
  };

  // Update status pembayaran berdasarkan metode pembayaran dan jumlah pembayaran
  const updateStatusPembayaran = (metodePembayaran, pembayaran, totalBiaya) => {
    if (metodePembayaran === 'bayar_penuh') {
      return pembayaran >= totalBiaya ? 'lunas' : 'belum_bayar';
    } else if (metodePembayaran === 'dp') {
      if (pembayaran >= totalBiaya) {
        return 'lunas';
      } else if (pembayaran >= totalBiaya * 0.5) {
        return 'dp_50%';
      } else {
        return 'belum_bayar';
      }
    } else {
      return 'belum_bayar';
    }
  };

  // Hitung sisa pembayaran untuk DP
  const calculateSisaPembayaran = (service) => {
    const totalBiaya = calculateTotalBiayaService(service);
    if (service.metodePembayaran === 'dp' && service.statusPembayaran === 'dp_50%') {
      return totalBiaya - service.pembayaran;
    }
    return 0;
  };

  // Filter sparepart berdasarkan pencarian
  const filteredSpareparts = stokBarang
    .filter(item => item.nama_barang.toLowerCase().includes(searchSparepart.toLowerCase()))
    .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));

  // Kelompokkan service berdasarkan tanggal
  const groupServicesByDate = () => {
    const grouped = {};
    
    services.forEach(service => {
      const date = service.tanggalMasuk?.toDate?.();
      if (date) {
        const dateKey = date.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(service);
      }
    });
    
    return grouped;
  };

  // Cek ukuran layar
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cek auth state dan redirect jika bukan teknisi
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/');
      } else {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
        if (userData.role !== 'teknisi') {
          router.push('/');
          return;
        }
        setUser(userData);
        fetchData();
      }
    });
    return () => unsubscribe();
  }, []);

  // Ambil data service dan stok
  const fetchData = async () => {
    try {
      const [serviceSnapshot, stokSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'service'), orderBy('tanggalMasuk', 'desc'))),
        getDocs(collection(db, 'stok'))
      ]);

      const servicesData = serviceSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        sparepartsUsed: doc.data().sparepartsUsed || [],
        formattedDate: doc.data().tanggalMasuk?.toDate?.().toLocaleString('id-ID') || '-',
        tanggalPengambilan: doc.data().tanggalPengambilan?.toDate?.() || null,
        formattedTanggalPengambilan: doc.data().tanggalPengambilan?.toDate?.().toLocaleString('id-ID') || '-'
      }));

      setServices(servicesData);

      const sortedStok = stokSnapshot.docs
        .map(doc => ({
          id: doc.id, 
          ...doc.data(),
          sisa: (doc.data().qty || 0) - (doc.data().terpakai || 0)
        }))
        .sort((a, b) => a.nama_barang.localeCompare(b.nama_barang));
      
      setStokBarang(sortedStok);

    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  // PERBAIKAN: Update stok dengan handling error
  const updateStok = async (spareparts, operation = 'decrement') => {
    const multiplier = operation === 'decrement' ? -1 : 1;
    
    try {
      const promises = spareparts.map(async (item) => {
        const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
        if (!sparepart) {
          throw new Error(`Sparepart "${item.nama}" tidak ditemukan`);
        }

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
      throw error;
    }
  };

  // PERBAIKAN: Reset form setelah submit
  const resetForm = () => {
    setNewService({
      namaPelanggan: '',
      merkHP: '',
      kerusakan: '',
      biaya: 0,
      status: 'Menunggu Konfirmasi',
      sparepartsUsed: [],
      pembayaran: 0,
      kembalian: 0,
      metodePembayaran: 'bayar_nanti',
      statusPembayaran: 'belum_bayar',
      statusPengambilan: 'belum_diambil'
    });
    setSearchSparepart('');
  };

  // PERBAIKAN: Tambah service baru dengan FIX duplikasi dan reset form
  const handleAddService = async () => {
    if (!newService.namaPelanggan || !newService.merkHP) {
      alert('Nama Pelanggan dan Merk HP wajib diisi!');
      return;
    }

    const totalBiaya = calculateTotalBiayaService();
    const statusPembayaran = updateStatusPembayaran(
      newService.metodePembayaran, 
      newService.pembayaran, 
      totalBiaya
    );

    // Validasi untuk pembayaran DP
    if (newService.metodePembayaran === 'dp' && newService.pembayaran < totalBiaya * 0.5) {
      alert('DP minimal 50% dari total biaya!');
      return;
    }

    // Validasi untuk pembayaran penuh
    if (newService.metodePembayaran === 'bayar_penuh' && newService.pembayaran < totalBiaya) {
      alert('Pembayaran tidak mencukupi untuk metode bayar penuh!');
      return;
    }

    const validSpareparts = newService.sparepartsUsed
      .filter(item => item.nama && item.qty > 0)
      .map(item => ({
        nama: item.nama,
        qty: Number(item.qty)
      }));

    // Validasi stok sparepart
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
      // FIX: Prevent multiple submission
      const submittingService = JSON.parse(JSON.stringify(newService));
      
      // Update stok sparepart
      if (validSpareparts.length > 0) {
        await updateStok(validSpareparts, 'decrement');
      }

      // Generate ID Service
      const serviceId = await generateServiceId();

      // Simpan service ke database
      await addDoc(collection(db, 'service'), {
        ...submittingService,
        serviceId: serviceId,
        biaya: Number(submittingService.biaya),
        sparepartsUsed: validSpareparts,
        pembayaran: Number(submittingService.pembayaran),
        kembalian: Number(submittingService.kembalian),
        metodePembayaran: submittingService.metodePembayaran,
        statusPembayaran: statusPembayaran,
        statusPengambilan: 'belum_diambil',
        teknisi: user.nama || user.email,
        tanggalMasuk: serverTimestamp(),
        userId: user.uid
      });

      // Reset form
      resetForm();
      
      // Refresh data
      fetchData();
      
      // Tampilkan success message dengan ID Service
      alert(`Service berhasil ditambahkan!\nID Service: ${serviceId}\n\nBerikan ID ini kepada pelanggan untuk melacak status service.`);
    } catch (error) {
      console.error("Error adding service:", error);
      alert(`Gagal menambahkan service: ${error.message}`);
    }
  };

  // Update status service
  const handleUpdateServiceStatus = async (serviceId, newStatus) => {
    try {
      const service = services.find(s => s.id === serviceId);
      
      // Validasi: jika HP sudah diambil, tidak bisa update status
      if (service.statusPengambilan === 'sudah_diambil') {
        alert('Tidak bisa mengubah status karena HP sudah diambil oleh pelanggan!');
        return;
      }

      const updateData = {
        status: newStatus,
        tanggalUpdate: serverTimestamp()
      };

      await updateDoc(doc(db, 'service', serviceId), updateData);
      fetchData();
      alert('Status service berhasil diperbarui!');
    } catch (error) {
      console.error("Error updating service status:", error);
      alert(`Gagal memperbarui status: ${error.message}`);
    }
  };

  // Validasi pengambilan HP oleh pelanggan
  const handleValidasiPengambilan = async (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    // Validasi: hanya bisa validasi pengambilan jika status sudah selesai
    if (service.status !== 'Sudah Selesai') {
      alert('Hanya bisa validasi pengambilan untuk service yang sudah selesai!');
      return;
    }

    // Validasi: cek status pembayaran
    if (service.statusPembayaran === 'belum_bayar') {
      const konfirmasi = window.confirm(
        `Peringatan! Service ${service.serviceId} belum lunas.\n` +
        `Status Pembayaran: ${getStatusPembayaranText(service.statusPembayaran)}\n` +
        `Yakin tetap validasi pengambilan?`
      );
      
      if (!konfirmasi) return;
    }

    const konfirmasiPengambilan = window.confirm(
      `Validasi pengambilan HP untuk service ${service.serviceId}?\n` +
      `Pelanggan: ${service.namaPelanggan}\n` +
      `Merk HP: ${service.merkHP}\n\n` +
      `Pastikan HP sudah diambil oleh pemilik yang benar!`
    );

    if (!konfirmasiPengambilan) return;

    try {
      await updateDoc(doc(db, 'service', serviceId), {
        statusPengambilan: 'sudah_diambil',
        tanggalPengambilan: serverTimestamp(),
        teknisiPengambil: user.nama || user.email
      });
      
      fetchData();
      alert('Pengambilan HP berhasil divalidasi!');
    } catch (error) {
      console.error("Error validating pickup:", error);
      alert(`Gagal validasi pengambilan: ${error.message}`);
    }
  };

  // Update status pembayaran
  const handleUpdateStatusPembayaran = async (serviceId, newStatusPembayaran) => {
    try {
      const service = services.find(s => s.id === serviceId);
      
      // Validasi: jika HP sudah diambil, tidak bisa update status pembayaran
      if (service.statusPengambilan === 'sudah_diambil') {
        alert('Tidak bisa mengubah status pembayaran karena HP sudah diambil oleh pelanggan!');
        return;
      }

      await updateDoc(doc(db, 'service', serviceId), {
        statusPembayaran: newStatusPembayaran,
        tanggalUpdatePembayaran: serverTimestamp()
      });
      fetchData();
      alert('Status pembayaran berhasil diperbarui!');
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert(`Gagal memperbarui status pembayaran: ${error.message}`);
    }
  };

  // Hapus service dengan validasi dan pengembalian stok
  const handleDeleteService = async (serviceId) => {
    const serviceToDelete = services.find(s => s.id === serviceId);
    if (!serviceToDelete) return;

    // Validasi: jika HP sudah diambil, tidak bisa hapus
    if (serviceToDelete.statusPengambilan === 'sudah_diambil') {
      alert('Tidak bisa menghapus service karena HP sudah diambil oleh pelanggan!');
      return;
    }

    const konfirmasi = window.confirm(`Yakin ingin menghapus service ${serviceToDelete.serviceId}? Stok sparepart yang digunakan akan dikembalikan.`);
    
    if (!konfirmasi) return;

    try {
      // Kembalikan stok sparepart yang digunakan
      if (serviceToDelete.sparepartsUsed?.length > 0) {
        await updateStok(serviceToDelete.sparepartsUsed, 'increment');
      }

      // Hapus service dari database
      await deleteDoc(doc(db, 'service', serviceId));
      
      fetchData();
      alert('Service berhasil dihapus dan stok telah dikembalikan!');
    } catch (error) {
      console.error("Error deleting service:", error);
      alert(`Gagal menghapus service: ${error.message}`);
    }
  };

  // Get text untuk status pembayaran
  const getStatusPembayaranText = (status) => {
    switch (status) {
      case 'lunas': return 'Lunas';
      case 'dp_50%': return 'DP 50%';
      case 'belum_bayar': return 'Belum Bayar';
      default: return status;
    }
  };

  // Get text untuk status pengambilan
  const getStatusPengambilanText = (status) => {
    switch (status) {
      case 'sudah_diambil': return 'Sudah Diambil';
      case 'belum_diambil': return 'Belum Diambil';
      default: return status;
    }
  };

  // Get color untuk status pembayaran
  const getStatusPembayaranColor = (status) => {
    switch (status) {
      case 'lunas': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'dp_50%': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'belum_bayar': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  // Get color untuk status pengambilan
  const getStatusPengambilanColor = (status) => {
    switch (status) {
      case 'sudah_diambil': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'belum_diambil': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  // Get color untuk status service
  const getStatusServiceColor = (status) => {
    switch (status) {
      case 'Sudah Selesai': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Batal': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Dalam Proses': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Menunggu Konfirmasi': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  // Cetak nota service
  const handleCetakNotaService = (serviceData) => {
    const totalBiaya = calculateTotalBiayaService(serviceData);
    const sisaPembayaran = calculateSisaPembayaran(serviceData);
    
    setTimeout(() => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Nota Service - ${serviceData.serviceId}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
              .nota { background: white; border-radius: 16px; padding: 30px; max-width: 400px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
              .header { text-align: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
              .items-table { width: 100%; border-collapse: collapse; margin: 25px 0; }
              .items-table th, .items-table td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
              .total { border-top: 2px solid #000; padding-top: 15px; text-align: right; font-weight: bold; }
              .footer { text-align: center; margin-top: 25px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; }
              .payment-info { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 12px; border-left: 4px solid #3b82f6; }
              .customer-info { background: #eff6ff; padding: 20px; margin: 20px 0; border-radius: 12px; border-left: 4px solid #1d4ed8; }
              .status-info { background: #fffbeb; padding: 20px; margin: 20px 0; border-radius: 12px; border-left: 4px solid #f59e0b; }
              .completed { background: #f0fdfa; border-left: 4px solid #10b981; }
              .warning { background: #fef2f2; border-left: 4px solid #ef4444; }
              @media print { 
                body { margin: 0; background: white; } 
                .nota { border: none; box-shadow: none; border-radius: 0; }
              }
            </style>
          </head>
          <body>
            <div class="nota">
              <div class="header">
                <h2 style="color: #1e40af; margin: 0 0 10px 0; font-size: 24px;">GOKU KOMUNIKA</h2>
                <p style="color: #64748b; margin: 5px 0; font-size: 12px;">Jl. Parakan Muncang, Sindang Kasih, Kec. Cimanggung, Kab. Sumedang</p>
                <p style="color: #64748b; margin: 5px 0; font-size: 12px;">WhatsApp: 0851-3633-6006</p>
              </div>
              
              <div style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 15px 0; margin: 15px 0;">
                <p style="font-weight: bold; color: #1e293b; margin: 5px 0;">Nota Service HP</p>
                <p style="color: #64748b; margin: 3px 0; font-size: 12px;">Tanggal: ${serviceData.formattedDate}</p>
                <p style="color: #64748b; margin: 3px 0; font-size: 12px;">ID Service: ${serviceData.serviceId}</p>
                <p style="color: #64748b; margin: 3px 0; font-size: 12px;">Teknisi: ${serviceData.teknisi || '-'}</p>
              </div>

              <div class="customer-info">
                <p style="font-weight: bold; color: #1e40af; margin: 0 0 10px 0;">Data Pelanggan:</p>
                <p style="color: #374151; margin: 5px 0;">Nama: ${serviceData.namaPelanggan}</p>
                <p style="color: #374151; margin: 5px 0;">Merk HP: ${serviceData.merkHP}</p>
                <p style="color: #374151; margin: 5px 0;">Kerusakan: ${serviceData.kerusakan || '-'}</p>
              </div>

              <table class="items-table">
                <thead>
                  <tr>
                    <th style="color: #64748b; font-weight: 600;">Deskripsi</th>
                    <th style="color: #64748b; font-weight: 600;">Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="color: #374151;">Biaya Service</td>
                    <td style="color: #374151;">Rp ${(serviceData.biaya || 0).toLocaleString()}</td>
                  </tr>
                  ${serviceData.sparepartsUsed?.map(item => {
                    const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
                    const harga = sparepart?.harga_jual || 0;
                    const subtotal = harga * item.qty;
                    return `
                      <tr>
                        <td style="color: #374151;">${item.nama} (x${item.qty})</td>
                        <td style="color: #374151;">Rp ${subtotal.toLocaleString()}</td>
                      </tr>
                    `;
                  }).join('') || ''}
                </tbody>
              </table>

              <div class="payment-info">
                <p style="font-weight: bold; color: #1e40af; margin: 0 0 10px 0;">Total Biaya: Rp ${totalBiaya.toLocaleString()}</p>
                <p style="color: #374151; margin: 5px 0;">Metode Bayar: ${serviceData.metodePembayaran === 'dp' ? 'DP 50%' : serviceData.metodePembayaran === 'bayar_nanti' ? 'Bayar Nanti' : 'Bayar Penuh'}</p>
                <p style="color: #374151; margin: 5px 0;">Status Pembayaran: <strong>${getStatusPembayaranText(serviceData.statusPembayaran)}</strong></p>
                ${serviceData.metodePembayaran === 'dp' && serviceData.statusPembayaran === 'dp_50%' ? `
                  <p style="color: #374151; margin: 5px 0;">DP Dibayar: Rp ${(serviceData.pembayaran || 0).toLocaleString()}</p>
                  <p class="warning" style="color: #dc2626; margin: 10px 0 0 0; font-weight: bold;">Sisa Pembayaran: Rp ${sisaPembayaran.toLocaleString()}</p>
                ` : serviceData.metodePembayaran === 'dp' && serviceData.statusPembayaran === 'lunas' ? `
                  <p style="color: #374151; margin: 5px 0;">DP Dibayar: Rp ${(serviceData.pembayaran || 0).toLocaleString()}</p>
                  <p class="completed" style="color: #059669; margin: 10px 0 0 0; font-weight: bold;">Sisa Setelah Dilunasi: Rp ${sisaPembayaran.toLocaleString()}</p>
                ` : `
                  <p style="color: #374151; margin: 5px 0;">Pembayaran: Rp ${(serviceData.pembayaran || 0).toLocaleString()}</p>
                  <p style="color: #374151; margin: 5px 0;">Kembalian: Rp ${(serviceData.kembalian || 0).toLocaleString()}</p>
                `}
              </div>

              <div class="status-info ${serviceData.statusPengambilan === 'sudah_diambil' ? 'completed' : ''}">
                <p style="font-weight: bold; color: #92400e; margin: 0 0 10px 0;">Status Pengambilan: ${getStatusPengambilanText(serviceData.statusPengambilan)}</p>
                ${serviceData.statusPengambilan === 'sudah_diambil' ? 
                  `<p style="color: #374151; margin: 5px 0;">Tanggal Pengambilan: ${serviceData.formattedTanggalPengambilan}</p>
                   <p style="color: #374151; margin: 5px 0;">Divalidasi oleh: ${serviceData.teknisiPengambil || '-'}</p>` : 
                  '<p style="color: #374151; margin: 5px 0;">HP belum diambil oleh pelanggan</p>'
                }
              </div>

              <div class="footer">
                <p style="margin: 5px 0;">Simpan ID Service untuk pengecekan status</p>
                <p style="margin: 5px 0; font-weight: bold;">Terima kasih atas kepercayaan Anda</p>
              </div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 1000);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }, 500);
  };

  const servicesByDate = groupServicesByDate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 p-4 md:p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 rounded-2xl p-6 mb-8 shadow-2xl shadow-blue-500/20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="text-white">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
              Dashboard Teknisi
            </h1>
            <p className="text-blue-100 text-lg">
              Selamat datang, <span className="font-semibold text-white">{user?.nama || user?.email}</span>
              <span className="ml-3 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-medium">
                👨‍🔧 Teknisi
              </span>
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button 
              onClick={() => signOut(auth).then(() => router.push('/'))}
              className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl font-semibold hover:bg-white/30 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 border border-white/30"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>Logout
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:scale-105">
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-4 rounded-2xl mr-4 shadow-lg">
              <i className="fas fa-tools text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-slate-600 text-sm font-medium">Total Service</p>
              <p className="text-3xl font-bold text-slate-800">{services.length}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:scale-105">
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-4 rounded-2xl mr-4 shadow-lg">
              <i className="fas fa-check-circle text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-slate-600 text-sm font-medium">Selesai</p>
              <p className="text-3xl font-bold text-slate-800">
                {services.filter(s => s.status === 'Sudah Selesai').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:scale-105">
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-2xl mr-4 shadow-lg">
              <i className="fas fa-money-bill-wave text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-slate-600 text-sm font-medium">Lunas</p>
              <p className="text-3xl font-bold text-slate-800">
                {services.filter(s => s.statusPembayaran === 'lunas').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:scale-105">
          <div className="flex items-center">
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-4 rounded-2xl mr-4 shadow-lg">
              <i className="fas fa-mobile-alt text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-slate-600 text-sm font-medium">Sudah Diambil</p>
              <p className="text-3xl font-bold text-slate-800">
                {services.filter(s => s.statusPengambilan === 'sudah_diambil').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section Input Service */}
      <section className="mb-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
        <div className="flex items-center mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-2xl shadow-lg mr-4">
            <i className="fas fa-plus-circle text-white text-2xl"></i>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Input Servis Baru</h2>
            <p className="text-slate-600">Tambah data service perbaikan HP baru</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Data Pelanggan */}
          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Nama Pelanggan*</label>
            <input
              type="text"
              value={newService.namaPelanggan}
              onChange={(e) => setNewService({...newService, namaPelanggan: e.target.value})}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              placeholder="Masukkan nama pelanggan"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Merk HP*</label>
            <input
              type="text"
              value={newService.merkHP}
              onChange={(e) => setNewService({...newService, merkHP: e.target.value})}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              placeholder="Contoh: Samsung A12, iPhone 11, dll"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-3 text-slate-700">Kerusakan</label>
            <textarea
              value={newService.kerusakan}
              onChange={(e) => setNewService({...newService, kerusakan: e.target.value})}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white resize-none"
              rows={3}
              placeholder="Jelaskan kerusakan yang dialami..."
            />
          </div>

          {/* Sparepart Digunakan */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-3 text-slate-700">Sparepart Digunakan</label>
            
            <div className="mb-4">
              <input
                type="text"
                placeholder="🔍 Cari sparepart..."
                value={searchSparepart}
                onChange={(e) => setSearchSparepart(e.target.value)}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              />
            </div>

            <div className="space-y-4">
              {newService.sparepartsUsed.map((item, index) => (
                <div key={index} className="flex gap-3 items-center p-4 bg-slate-50 rounded-xl border-2 border-slate-200 hover:border-blue-300 transition-all duration-300">
                  <select
                    value={item.nama}
                    onChange={(e) => {
                      const updated = [...newService.sparepartsUsed];
                      updated[index].nama = e.target.value;
                      setNewService({...newService, sparepartsUsed: updated});
                    }}
                    className="flex-1 p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-white"
                  >
                    <option value="">📱 Pilih Sparepart</option>
                    {filteredSpareparts.map(sp => (
                      <option key={sp.id} value={sp.nama_barang}>
                        {sp.nama_barang} (Stok: {sp.sisa}, Harga: Rp {sp.harga_jual?.toLocaleString('id-ID')})
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
                    className="w-24 p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-white text-center"
                    min="1"
                  />
                  <button
                    onClick={() => {
                      setNewService({
                        ...newService,
                        sparepartsUsed: newService.sparepartsUsed.filter((_, i) => i !== index)
                      });
                    }}
                    className="text-rose-500 hover:text-rose-700 p-3 hover:bg-rose-50 rounded-xl transition-all duration-300"
                  >
                    <i className="fas fa-times text-lg"></i>
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
                className="text-blue-600 font-semibold text-sm flex items-center gap-3 mt-2 p-4 hover:bg-blue-50 rounded-xl transition-all duration-300 border-2 border-dashed border-blue-200 hover:border-blue-400"
              >
                <i className="fas fa-plus-circle text-blue-500"></i> 
                <span>Tambah Sparepart</span>
              </button>
            </div>
          </div>

          {/* Total Biaya */}
          <div className="md:col-span-2">
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-6 rounded-2xl border-2 border-blue-200">
              <h3 className="font-bold text-slate-800 mb-4 text-lg flex items-center">
                <i className="fas fa-calculator text-blue-500 mr-3"></i>Rincian Biaya
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-slate-600">Biaya Service:</div>
                <div className="text-right font-semibold text-slate-800">Rp {newService.biaya?.toLocaleString() || '0'}</div>
                <div className="text-slate-600">Biaya Sparepart:</div>
                <div className="text-right font-semibold text-slate-800">Rp {newService.sparepartsUsed?.reduce((total, item) => {
                  const sparepart = stokBarang.find(sp => sp.nama_barang === item.nama);
                  return total + ((sparepart?.harga_jual || 0) * item.qty);
                }, 0)?.toLocaleString() || '0'}</div>
                <div className="font-bold text-slate-800 text-lg">Total Biaya:</div>
                <div className="text-right font-bold text-emerald-600 text-lg">
                  Rp {calculateTotalBiayaService().toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Form Pembayaran */}
          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Biaya Service (Rp)</label>
            <input
              type="number"
              value={newService.biaya}
              onChange={(e) => {
                const biaya = Math.max(0, Number(e.target.value));
                const totalBiaya = calculateTotalBiayaService({...newService, biaya});
                const statusPembayaran = updateStatusPembayaran(
                  newService.metodePembayaran, 
                  newService.pembayaran, 
                  totalBiaya
                );
                
                setNewService({
                  ...newService, 
                  biaya: biaya,
                  statusPembayaran: statusPembayaran
                });
              }}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Status</label>
            <select
              value={newService.status}
              onChange={(e) => setNewService({...newService, status: e.target.value})}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-white"
            >
              <option value="Menunggu Konfirmasi">⏳ Menunggu Konfirmasi</option>
              <option value="Dalam Proses">🔧 Dalam Proses</option>
              <option value="Sudah Selesai">✅ Sudah Selesai</option>
              <option value="Batal">❌ Batal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Metode Pembayaran</label>
            <select
              value={newService.metodePembayaran}
              onChange={(e) => {
                const metodePembayaran = e.target.value;
                const totalBiaya = calculateTotalBiayaService();
                const statusPembayaran = updateStatusPembayaran(
                  metodePembayaran, 
                  newService.pembayaran, 
                  totalBiaya
                );
                
                setNewService({
                  ...newService, 
                  metodePembayaran: metodePembayaran,
                  statusPembayaran: statusPembayaran
                });
              }}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-white"
            >
              <option value="bayar_nanti">💳 Bayar Nanti</option>
              <option value="dp">💰 DP 50%</option>
              <option value="bayar_penuh">💵 Bayar Penuh</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Status Pembayaran</label>
            <div className={`w-full p-4 border-2 rounded-xl font-semibold text-center ${getStatusPembayaranColor(newService.statusPembayaran)}`}>
              {getStatusPembayaranText(newService.statusPembayaran)}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">
              {newService.metodePembayaran === 'dp' ? '💰 DP (Min 50%)' : '💵 Pembayaran'} (Rp)
            </label>
            <input
              type="number"
              value={newService.pembayaran}
              onChange={(e) => {
                const pembayaran = Math.max(0, Number(e.target.value));
                const totalBiaya = calculateTotalBiayaService();
                const statusPembayaran = updateStatusPembayaran(
                  newService.metodePembayaran, 
                  pembayaran, 
                  totalBiaya
                );
                
                handlePembayaranServiceChange(pembayaran);
                setNewService(prev => ({
                  ...prev,
                  statusPembayaran: statusPembayaran
                }));
              }}
              className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 bg-slate-50 hover:bg-white"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-3 text-slate-700">Kembalian (Rp)</label>
            <input
              type="number"
              value={newService.kembalian}
              readOnly
              className="w-full p-4 border-2 border-slate-200 rounded-xl bg-slate-100 text-slate-700 font-semibold"
            />
          </div>
        </div>

        <button 
          onClick={handleAddService}
          className="mt-8 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3"
        >
          <i className="fas fa-save"></i> 
          <span>Tambah Servis</span>
        </button>
      </section>

      {/* Daftar Semua Service - Dikelompokkan per Hari */}
      <section className="mb-10">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl shadow-2xl overflow-hidden mb-8">
          <div className="p-8">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <i className="fas fa-list mr-4 text-blue-400"></i>Daftar Semua Service
            </h2>
            <p className="text-slate-300 mt-2">Kelola semua data service perbaikan HP</p>
          </div>
        </div>

        {Object.keys(servicesByDate).length > 0 ? (
          Object.entries(servicesByDate).map(([date, servicesOnDate]) => (
            <div key={date} className="mb-8 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
                <h3 className="text-xl font-bold text-slate-800 flex items-center">
                  <i className="fas fa-calendar-day mr-3 text-blue-500"></i>{date}
                </h3>
                <p className="text-slate-600 text-sm mt-2">
                  📊 Total Service: <span className="font-semibold">{servicesOnDate.length}</span> | 
                  ✅ Selesai: <span className="font-semibold text-emerald-600">{servicesOnDate.filter(s => s.status === 'Sudah Selesai').length}</span> | 
                  💰 Lunas: <span className="font-semibold text-purple-600">{servicesOnDate.filter(s => s.statusPembayaran === 'lunas').length}</span> |
                  📱 Sudah Diambil: <span className="font-semibold text-orange-600">{servicesOnDate.filter(s => s.statusPengambilan === 'sudah_diambil').length}</span>
                </p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-50 to-blue-50">
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">No</th>
                      <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">ID Service</th>
                      <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Pelanggan</th>
                      <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Merk HP</th>
                      <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Kerusakan</th>
                      <th className="p-4 border-b border-slate-200 text-slate-700 font-bold">Sparepart</th>
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Total Biaya</th>
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Status Bayar</th>
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Status</th>
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Pengambilan</th>
                      <th className="p-4 border-b border-slate-200 text-center text-slate-700 font-bold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicesOnDate.map((service, index) => {
                      const totalBiaya = calculateTotalBiayaService(service);
                      const isServiceLocked = service.statusPengambilan === 'sudah_diambil';

                      return (
                        <tr key={service.id} className={
                          service.status === 'Sudah Selesai' ? 'bg-emerald-50 hover:bg-emerald-100' : 
                          service.status === 'Batal' ? 'bg-rose-50 hover:bg-rose-100' : 
                          'bg-blue-50 hover:bg-blue-100'
                        }>
                          <td className="p-4 border-b border-slate-200 text-center font-semibold text-slate-700">{index + 1}</td>
                          
                          <td className="p-4 border-b border-slate-200">
                            <span className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-2 rounded-xl text-sm font-bold font-mono shadow-lg">
                              {service.serviceId || 'N/A'}
                            </span>
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 font-semibold text-slate-800">{service.namaPelanggan}</td>
                          <td className="p-4 border-b border-slate-200 font-semibold text-slate-800">{service.merkHP}</td>
                          <td className="p-4 border-b border-slate-200">
                            <span className="text-sm text-slate-600">{service.kerusakan || '-'}</span>
                          </td>
                          
                          <td className="p-4 border-b border-slate-200">
                            {service.sparepartsUsed?.length > 0 ? (
                              <div className="text-xs space-y-1">
                                {service.sparepartsUsed.map((item, idx) => (
                                  <div key={idx} className="bg-white px-2 py-1 rounded-lg border border-slate-200">
                                    {item.nama} (x{item.qty})
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">-</span>
                            )}
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 text-center font-bold text-slate-800">
                            Rp {totalBiaya.toLocaleString()}
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 text-center">
                            {isServiceLocked ? (
                              <span className={`px-3 py-2 rounded-xl text-xs font-semibold ${getStatusPembayaranColor(service.statusPembayaran)}`}>
                                {getStatusPembayaranText(service.statusPembayaran)}
                              </span>
                            ) : (
                              <select
                                value={service.statusPembayaran}
                                onChange={(e) => handleUpdateStatusPembayaran(service.id, e.target.value)}
                                className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all duration-300 ${getStatusPembayaranColor(service.statusPembayaran)} hover:shadow-lg`}
                              >
                                <option value="belum_bayar">Belum Bayar</option>
                                <option value="dp_50%">DP 50%</option>
                                <option value="lunas">Lunas</option>
                              </select>
                            )}
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 text-center">
                            {isServiceLocked ? (
                              <span className={`px-3 py-2 rounded-xl text-xs font-semibold ${getStatusServiceColor(service.status)}`}>
                                {service.status}
                              </span>
                            ) : (
                              <select
                                value={service.status}
                                onChange={(e) => handleUpdateServiceStatus(service.id, e.target.value)}
                                className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all duration-300 ${getStatusServiceColor(service.status)} hover:shadow-lg`}
                              >
                                <option value="Menunggu Konfirmasi">Menunggu</option>
                                <option value="Dalam Proses">Proses</option>
                                <option value="Sudah Selesai">Selesai</option>
                                <option value="Batal">Batal</option>
                              </select>
                            )}
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 text-center">
                            <div className="flex flex-col gap-2">
                              <span className={`px-3 py-2 rounded-xl text-xs font-semibold ${getStatusPengambilanColor(service.statusPengambilan)}`}>
                                {getStatusPengambilanText(service.statusPengambilan)}
                              </span>
                              {service.status === 'Sudah Selesai' && service.statusPengambilan === 'belum_diambil' && (
                                <button
                                  onClick={() => handleValidasiPengambilan(service.id)}
                                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105"
                                >
                                  ✅ Validasi
                                </button>
                              )}
                            </div>
                          </td>
                          
                          <td className="p-4 border-b border-slate-200 text-center">
                            <div className="flex flex-col gap-3 justify-center">
                              <button
                                onClick={() => handleCetakNotaService(service)}
                                className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-3 rounded-xl text-xs font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-print"></i>
                                <span>Cetak Nota</span>
                              </button>
                              {!isServiceLocked && (
                                <button
                                  onClick={() => handleDeleteService(service.id)}
                                  className="bg-gradient-to-r from-rose-500 to-pink-500 text-white px-4 py-3 rounded-xl text-xs font-semibold hover:shadow-lg transition-all duration-300 hover:scale-105 flex items-center justify-center gap-2"
                                >
                                  <i className="fas fa-trash"></i>
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center border border-slate-100">
            <div className="bg-gradient-to-r from-blue-100 to-cyan-100 p-8 rounded-2xl inline-block mb-6">
              <i className="fas fa-inbox text-6xl text-blue-400"></i>
            </div>
            <h3 className="text-2xl font-bold text-slate-700 mb-4">Belum ada data service</h3>
            <p className="text-slate-500 text-lg">Mulai dengan menambahkan service perbaikan HP baru</p>
          </div>
        )}
      </section>
    </div>
  );
}