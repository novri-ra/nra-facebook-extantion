# 🟢 NRA FB MANAGER / UNFOLLOW

```text
    _   ______  ___    ___                           _       _     
   / | / / __ \/   |  /   |  ____  __  ______  ___  (_)___  (_)  __
  /  |/ / /_/ / /| | / /| | / __ \/ / / / __ \/ _ \/ / __ \/ / |/_/
 / /|  / _, _/ ___ |/ ___ |/ / / / /_/ / / / /  __/ / /_/ / />  <  
/_/ |_/_/ |_/_/  |_/_/  |_/_/ /_/\__,_/_/ /_/\___/_/ .___/_/_/|_|  
                                                  /_/              
```

## 💻 ABOUT THE PROJECT
**NRA FB Manager** (sebelumnya NRA Unfollow) adalah ekstensi peramban Chrome MV3 murni klien (Vanilla JS) yang dirancang dengan antarmuka **Retro Terminal / Cyberpunk** ala **NRA DreamLab**. Ekstensi ini dibangun untuk mempermudah pembersihan daftar pertemanan Facebook secara massal melalui eksekusi *Unfollow* dan *Unfriend* otomatis.

## ✨ FITUR UTAMA
- **[+] Auto-Scroll Tangguh:** Mesin pemuatan cerdas yang mengelabui *lazy-loader* Facebook untuk memuat daftar ratusan hingga ribuan teman secara otomatis.
- **[+] Eksekutor Presisi (Unfriend / Unfollow):** Klik aman tanpa campur tangan *mouse* sungguhan. Otomatis membaca struktur DOM, membuka *pop-over*, dan mengonfirmasi penghapusan.
- **[+] Dry Run Mode:** Mode aman bawaan. Tidak ada yang dihapus, hanya berjalan sebagai simulasi untuk tes ketahanan.
- **[+] Kill Switch Darurat:** Tombol bahaya merah untuk menghentikan proses eksekusi seketika.
- **[+] Dashboard Real-time:** Memantau jumlah target, *success rate*, dan Estimasi Waktu (ETA) berjalannya program langsung di dalam panel terminal.
- **[+] Stealth & Humanize:** Dilengkapi jeda waktu acak (*random delay*) demi meniru interaksi manusia dan menghindari batasan (rate limit) dari FB.

## 📦 CARA INSTALASI (MANUAL DARI `.zip`)
1. Buka halaman **[Releases](https://github.com/novri-ra/nra-facebook-extantion/releases)** di repositori ini.
2. Unduh *file* `extension.zip` versi terbaru (kode versi rilis sudah dienkripsi/obfuscated demi integritas).
3. Ekstrak *file* `.zip` tersebut di sebuah *folder* dalam komputer Anda.
4. Buka peramban Google Chrome, ketikkan `chrome://extensions/` pada *address bar* lalu tekan *Enter*.
5. Aktifkan sakelar **Developer mode** (Mode Pengembang) di pojok kanan atas.
6. Klik tombol **Load unpacked** (Muat ekstensi yang belum dipaketkan) di kiri atas.
7. Pilih *folder* hasil ekstraksi dari `.zip` tadi.
8. Ekstensi **NRA FB Manager** kini berhasil dipasang dan akan muncul di bilah ekstensi peramban Anda!

## ⚠️ PERINGATAN & BATAS AMAN PENGGUNAAN
> **DISCLAIMER:** Gunakan ekstensi otomatisasi ini dengan hati-hati. Segala risiko pemblokiran ditanggung penuh oleh pengguna.
- **Batasi Target:** Tolong jangan mengeksekusi lebih dari 500 target dalam satu waktu operasi. Facebook mempunyai batasan sistem blok interaksi dalam satu jam.
- **Tetap di Halaman Utama:** Layar *browser* harus dibiarkan aktif (tidak diminimalkan) karena ekstensi butuh mengeksekusi DOM secara waktu nyata (Real-Time).
- **Utamakan Unfollow:** Jika daftar terlalu banyak, pertimbangkan memakai fitur `UNFOLLOW` dulu agar *feed* beranda bersih, alih-alih `UNFRIEND` agresif permanen.

---
*Created and developed securely with Vanilla MV3.* **[NRA DreamLab]**