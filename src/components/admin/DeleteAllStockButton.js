import React from "react";

export default function DeleteAllStockButton() {
  const handleDeleteAllStock = async () => {
    if (!confirm("Yakin ingin menghapus semua stok barang?")) return;

    try {
      const res = await fetch("/api/delete-all-stock", {
        method: "DELETE",
      });

      if (res.ok) {
        alert("Semua stok barang berhasil dihapus");
        window.location.reload(); // reload halaman biar data segar
      } else {
        alert("Gagal menghapus stok barang");
      }
    } catch (error) {
      console.error("Error menghapus semua stok:", error);
    }
  };

  return (
    <button
      onClick={handleDeleteAllStock}
      className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 transition"
    >
      Hapus Semua
    </button>
  );
}
