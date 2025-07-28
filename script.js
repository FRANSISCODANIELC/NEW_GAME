document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('grid-container')) {
        initGame();
    }
});

function initGame() {
    console.log("initGame() called.");

    const gridContainer = document.getElementById('grid-container');
    const sisaAnggaranEl = document.getElementById('sisa-anggaran');
    const totalBiayaEl = document.getElementById('total-biaya');
    const totalKeuntunganEl = document.getElementById('total-keuntungan');
    const buildingButtonsContainer = document.getElementById('building-buttons');
    const sellButton = document.getElementById('sell-button');
    const menuButton = document.getElementById('menu-button');
    const clearButton = document.getElementById('clear-button');
    const menuPopup = document.getElementById('menu-popup');
    const summaryPopup = document.getElementById('summary-popup');
    const loadingPopup = document.getElementById('loading-popup');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const soldUnitsCount = document.getElementById('sold-units-count');
    const closeSummaryButton = document.getElementById('close-summary');
    const skipButton = document.getElementById('skip-button');
    const rulesButton = document.getElementById('rules-button');
    const rulesPopup = document.getElementById('rules-popup');
    const closeRulesPopup = document.getElementById('close-rules-popup');
    const fullscreenButton = document.getElementById('fullscreen-button');
    const buildingInfoPanel = document.getElementById('building-info-panel');

    // Elemen untuk menampilkan jumlah bangunan
    const countRumahEl = document.getElementById('count-rumah');
    const countRumahMewahEl = document.getElementById('count-rumah-mewah');
    const countTamanEl = document.getElementById('count-taman');
    const countMushollahEl = document.getElementById('count-mushollah');

    const params = new URLSearchParams(window.location.search);
    const gridSize = parseInt(params.get('size')) || 9;

    // Ambil semua profil developer dan indeks profil aktif dari localStorage
    const developerProfiles = JSON.parse(localStorage.getItem('developerProfiles')) || [];
    const activeDeveloperIndex = parseInt(localStorage.getItem('activeDeveloperIndex'));

    let activeDeveloper = null;
    if (activeDeveloperIndex !== -1 && developerProfiles[activeDeveloperIndex]) {
        activeDeveloper = developerProfiles[activeDeveloperIndex];
    }

    if (!activeDeveloper) {
        // Jika tidak ada profil aktif, arahkan kembali ke dashboard
        window.location.href = 'dashboard.html';
        return;
    }
    const initialAnggaran = activeDeveloper.capital;

    let sisaAnggaran, totalBiaya, totalKeuntungan, selectedTool, jumlahRumah;
    let gameGrid = []; // Representasi internal grid
    let buildingCounts = { rumah: 0, taman: 0, mushollah: 0, rumah_mewah: 0 }; // Penghitung bangunan
    let isMoving = false; // Status untuk fitur pindah
    let movingBuilding = null; // Info bangunan yang akan dipindah

    // Variabel untuk fitur drag-and-drop
    let isDragging = false;
    let lastProcessedCell = null; // Untuk mencegah pemrosesan sel yang sama berulang kali saat drag

    // Konstanta untuk perhitungan waktu penjualan
    const DISTANCE_DECAY_PER_GRID = 0.01; // 1% pengurangan efek per jarak 1 grid
    const DAYS_TO_SECONDS_RATIO = 0.3; // 1 hari = 0.3 detik

    const itemInfo = {
        rumah: { biaya: 50, nilaiJual: 120, baseSellingTime: 30, icon: 'fa-home' }, // 30 hari standar
        rumah_mewah: { biaya: 200, nilaiJual: 720, baseSellingTime: 60, icon: 'fa-building' }, // Biaya 4 rumah, Jual 6x
        taman: { biaya: 5, nilaiJual: 0, effectPercentage: 0.15, icon: 'fa-tree' }, // 15% pengurangan waktu
        jalan_utama: { biaya: 2, nilaiJual: 0, effectPercentage: 0.02, type: 'road', blockClass: 'jalan-block-utama' }, // 2% pengurangan waktu
        jalan_sekunder: { biaya: 1, nilaiJual: 0, effectPercentage: 0.01, type: 'road', blockClass: 'jalan-block-sekunder' }, // 1% pengurangan waktu
        mushollah: { biaya: 50, nilaiJual: 0, effectPercentage: 0.25, icon: 'fa-mosque' }, // 25% pengurangan waktu
        upgrade: { biaya: 50 }, // Biaya upgrade seharga 1 rumah
        move: { biaya: 0 },
        eraser: { biaya: 0 } // Eraser tidak memiliki biaya atau dampak
    };

    function formatNumberWithThousandsSeparator(number) {
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    function resetGame() {
        sisaAnggaran = initialAnggaran;
        totalBiaya = 0;
        totalKeuntungan = 0;
        selectedTool = null;
        jumlahRumah = 0;
        buildingCounts = { rumah: 0, taman: 0, mushollah: 0, rumah_mewah: 0 }; // Reset penghitung
        
        // Inisialisasi gameGrid
        gameGrid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));

        createGrid(); // Buat ulang tampilan grid
        updateInfoPanel();
        const buttons = buildingButtonsContainer.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('selected'));
    }

    function createGrid() {
        gridContainer.innerHTML = '';

        // Dapatkan ukuran main-container yang sudah diskalakan 16:9
        const mainContainer = document.getElementById('main-container');
        const mainContainerWidth = mainContainer.clientWidth;
        const mainContainerHeight = mainContainer.clientHeight;

        // Alokasikan sebagian ruang untuk grid (misalnya 70% dari tinggi main-container)
        const availableHeightForGrid = mainContainerHeight * 0.7; 
        const availableWidthForGrid = mainContainerWidth * 0.7; // Sesuaikan jika perlu

        // Hitung ukuran sel optimal berdasarkan ruang yang dialokasikan
        const cellSize = Math.floor(Math.min(availableWidthForGrid / gridSize, availableHeightForGrid / gridSize));

        gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, ${cellSize}px)`;
        gridContainer.style.gridTemplateRows = `repeat(${gridSize}, ${cellSize}px)`;
        gridContainer.style.width = `${gridSize * cellSize}px`;
        gridContainer.style.height = `${gridSize * cellSize}px`;

        // Pastikan grid tidak melebihi grid-card
        const gridCard = document.getElementById('grid-card');
        gridCard.style.maxWidth = `${gridSize * cellSize}px`;
        gridCard.style.maxHeight = `${gridSize * cellSize}px`;

        for (let i = 0; i < gridSize * gridSize; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.index = i;
            cell.style.fontSize = `${cellSize * 0.6}px`; // Ukuran ikon proporsional dengan sel
            // Event listener untuk drag-and-drop
            cell.addEventListener('mousedown', (e) => handleMouseDown(e, cell));
            cell.addEventListener('mouseover', () => handleMouseOver(cell));
            gridContainer.appendChild(cell);
        }
    }

    // Helper untuk mendapatkan sel dari event sentuh
    function getCellFromTouchEvent(e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return document.elementFromPoint(touch.clientX, touch.clientY);
    }

    // Handler untuk touchstart
    function handleTouchStart(e, cell) {
        e.preventDefault(); // Mencegah scrolling dan zoom default browser
        handleMouseDown({ button: 0, target: cell }, cell); // Simulasikan klik kiri mouse
    }

    // Handler untuk touchmove
    function handleTouchMove(e) {
        e.preventDefault();
        const cell = getCellFromTouchEvent(e);
        if (cell && cell.classList.contains('grid-cell')) {
            handleMouseOver(cell);
        }
    }

    // Handler untuk touchend
    function handleTouchEnd(e) {
        e.preventDefault();
        const cell = getCellFromTouchEvent(e);
        if (cell && cell.classList.contains('grid-cell')) {
            handleMouseUp({ target: cell }); // Simulasikan mouseup pada sel
        } else { // Jika dilepas di luar grid
            handleMouseUp({ target: null });
        }
    }

    // Helper: Konversi index 1D ke koordinat 2D
    function getCoords(index) {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        return { row, col };
    }

    // Helper: Konversi koordinat 2D ke index 1D
    function getIndex(row, col) {
        return row * gridSize + col;
    }

    // Helper: Hitung jarak Euclidean
    function calculateDistance(r1, c1, r2, c2) {
        return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(c2 - c1, 2));
    }

    // Helper: Cek apakah bangunan terhubung dengan jalan
    function isConnectedToRoad(row, col) {
        // Periksa 8 sel di sekitar bangunan (termasuk diagonal)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Lewati sel bangunan itu sendiri

                const neighborRow = row + dr;
                const neighborCol = col + dc;

                // Pastikan tetangga berada di dalam batas grid
                if (neighborRow >= 0 && neighborRow < gridSize &&
                    neighborCol >= 0 && neighborCol < gridSize) {
                    const neighborType = gameGrid[neighborRow][neighborCol];
                    if (neighborType && (neighborType === 'jalan_utama' || neighborType === 'jalan_sekunder')) {
                        return true; // Terhubung dengan jalan
                    }
                }
            }
        }
        return false; // Tidak terhubung dengan jalan
    }

    // Helper: Cek apakah jalan terhubung dengan jalan lain
    function isRoadConnectedToOtherRoad(row, col) {
        // Periksa 8 sel di sekitar jalan (termasuk diagonal)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue; // Lewati sel jalan itu sendiri

                const neighborRow = row + dr;
                const neighborCol = col + dc;

                // Pastikan tetangga berada di dalam batas grid
                if (neighborRow >= 0 && neighborRow < gridSize &&
                    neighborCol >= 0 && neighborCol < gridSize) {
                    const neighborType = gameGrid[neighborRow][neighborCol];
                    if (neighborType && (neighborType === 'jalan_utama' || neighborType === 'jalan_sekunder')) {
                        // Jika ada jalan lain di sekitarnya, maka terhubung
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Fungsi untuk memulai aksi (klik atau drag)
    function handleMouseDown(e, cell) {
        if (e.button !== 0) return; // Hanya proses klik kiri

        const { row, col } = getCoords(parseInt(cell.dataset.index));

        if (selectedTool === 'move') {
            if (isMoving) { // Klik kedua: meletakkan bangunan
                if (gameGrid[row][col]) { // Petak tujuan sudah terisi
                    alert("Petak tujuan sudah terisi!");
                    return; // Jangan letakkan, tetap dalam mode pindah
                }
                // Letakkan bangunan
                const { type } = movingBuilding;
                gameGrid[row][col] = type;
                const item = itemInfo[type];
                if (item.type === 'road') {
                    cell.innerHTML = `<div class="${item.blockClass}"></div>`;
                } else {
                    cell.innerHTML = `<i class="fas ${item.icon}"></i>`;
                }
                cell.dataset.type = type;

                // Reset status pindah
                isMoving = false;
                movingBuilding = null;
                selectedTool = null; // Batalkan pilihan alat setelah pindah
                const buttons = buildingButtonsContainer.querySelectorAll('button');
                buttons.forEach(btn => btn.classList.remove('selected'));
                gridContainer.style.cursor = 'pointer'; // Kembalikan kursor
                updateInfoPanel();

            } else { // Klik pertama: mengambil bangunan
                const type = gameGrid[row][col];
                if (!type) {
                    // Tidak ada peringatan jika klik petak kosong dengan alat 'move'
                    return;
                }
                if (type === 'rumah_mewah_part') {
                    alert("Pindahkan Rumah Mewah dari ikon utamanya (kiri atas).");
                    return;
                }

                isMoving = true; // Set status "diambil"
                movingBuilding = { type, fromRow: row, fromCol: col }; // Simpan lokasi dan tipe asli

                // Hapus sementara dari grid
                gameGrid[row][col] = null;
                cell.innerHTML = '';
                cell.removeAttribute('data-type');
                gridContainer.style.cursor = 'grabbing'; // Ubah kursor menjadi "menggenggam"
            }
        } else { // Logika untuk alat lain (tempatkan, hapus, upgrade)
            // Jika sedang dalam mode pindah (dari alat lain), batalkan pindah sebelumnya
            if (isMoving) {
                revertMove();
                isMoving = false;
                movingBuilding = null;
                gridContainer.style.cursor = 'pointer';
            }

            isDragging = true; // Ini untuk penempatan berkelanjutan (misalnya, jalan)
            lastProcessedCell = cell;

            if (selectedTool === 'eraser') {
                eraseBuilding(cell, row, col);
            } else if (selectedTool === 'upgrade') {
                upgradeBuilding(row, col);
            } else { // Menempatkan bangunan baru
                if (gameGrid[row][col]) {
                    alert("Petak ini sudah terisi. Gunakan penghapus untuk membersihkannya.");
                    isDragging = false; // Batalkan drag jika petak awal sudah terisi
                    return;
                }
                placeBuilding(cell, row, col);
            }
        }
    }

    // Fungsi untuk melanjutkan aksi saat drag
    function handleMouseOver(cell) {
        if (!isDragging || cell === lastProcessedCell) {
            return;
        }
        
        const { row, col } = getCoords(parseInt(cell.dataset.index));
        
        // Hanya proses jika tool bukan eraser atau upgrade (yang hanya bekerja per-klik)
        if (selectedTool !== 'eraser' && selectedTool !== 'upgrade' && selectedTool !== 'move') {
             if (gameGrid[row][col] === null) { // Hanya bangun di petak kosong
                placeBuilding(cell, row, col);
             }
        }
        lastProcessedCell = cell;
    }

    // Fungsi untuk mengakhiri aksi drag (hanya untuk penempatan berkelanjutan)
    function handleMouseUp() {
        isDragging = false;
        lastProcessedCell = null;
        // Kursor direset di handleMouseDown untuk alat 'move' atau di selectTool jika dibatalkan
        if (!isMoving) { 
            gridContainer.style.cursor = 'pointer';
        }
    }

    function placeBuilding(cell, row, col) {
        const item = itemInfo[selectedTool];
        if (sisaAnggaran < item.biaya) {
            alert("Anggaran tidak cukup!");
            return;
        }

        // Validasi konektivitas untuk mushollah dan jalan sekunder
        if (selectedTool === 'mushollah' && !isConnectedToRoad(row, col)) {
            alert("Mushollah harus terhubung dengan jalan!");
            return;
        }
        if (selectedTool === 'jalan_sekunder' && !isRoadConnectedToOtherRoad(row, col)) {
            alert("Jalan sekunder harus terhubung dengan jalan lain!");
            return;
        }

        sisaAnggaran -= item.biaya;
        totalBiaya += item.biaya;
        totalKeuntungan += (item.nilaiJual - item.biaya);
        if(selectedTool === 'rumah') jumlahRumah++;

        // Update gameGrid internal
        gameGrid[row][col] = selectedTool;

        // Update buildingCounts
        if (buildingCounts.hasOwnProperty(selectedTool)) {
            buildingCounts[selectedTool]++;
        }

        // Update tampilan sel
        if (item.type === 'road') {
            cell.innerHTML = `<div class="${item.blockClass}"></div>`;
        } else {
            cell.innerHTML = `<i class="fas ${item.icon}"></i>`;
        }
        cell.dataset.type = selectedTool; // Simpan tipe di dataset untuk referensi cepat
        updateInfoPanel();
    }

    function revertMove() {
        if (!movingBuilding) return;

        const { type, fromRow, fromCol } = movingBuilding;
        const originalCell = gridContainer.children[getIndex(fromRow, fromCol)];

        // Kembalikan ke posisi semula
        gameGrid[fromRow][fromCol] = type;
        const item = itemInfo[type];
        if (item.type === 'road') {
            originalCell.innerHTML = `<div class="${item.blockClass}"></div>`;
        } else {
            originalCell.innerHTML = `<i class="fas ${item.icon}"></i>`;
        }
        originalCell.dataset.type = type;
    }

    function upgradeBuilding(row, col) {
        const upgradeCost = itemInfo.upgrade.biaya;
        if (sisaAnggaran < upgradeCost) {
            alert("Anggaran tidak cukup untuk upgrade!");
            return;
        }

        // Tentukan petak mana yang harus diperiksa untuk membentuk bujur sangkar 2x2
        // Kita periksa 4 kemungkinan posisi bujur sangkar dimana (row, col) adalah salah satu sudutnya
        const positions = [
            { r: row, c: col }, // Klik di kiri-atas
            { r: row, c: col - 1 }, // Klik di kanan-atas
            { r: row - 1, c: col }, // Klik di kiri-bawah
            { r: row - 1, c: col - 1 }  // Klik di kanan-bawah
        ];

        let foundSquare = false;
        for (const pos of positions) {
            const r1 = pos.r;
            const c1 = pos.c;
            const r2 = r1 + 1;
            const c2 = c1 + 1;

            // Pastikan semua koordinat dalam batas grid
            if (r1 < 0 || c1 < 0 || r2 >= gridSize || c2 >= gridSize) continue;

            const topLeft = gameGrid[r1][c1];
            const topRight = gameGrid[r1][c2];
            const bottomLeft = gameGrid[r2][c1];
            const bottomRight = gameGrid[r2][c2];

            if (topLeft === 'rumah' && topRight === 'rumah' && bottomLeft === 'rumah' && bottomRight === 'rumah') {
                // Bujur sangkar ditemukan!
                sisaAnggaran -= upgradeCost;
                totalBiaya += upgradeCost;

                // Hapus 4 rumah lama
                const cellsToRemove = [getIndex(r1, c1), getIndex(r1, c2), getIndex(r2, c1), getIndex(r2, c2)];
                cellsToRemove.forEach(index => {
                    const cell = gridContainer.children[index];
                    const {row, col} = getCoords(index);
                    gameGrid[row][col] = null; // Kosongkan di grid internal
                    cell.innerHTML = '';
                    cell.removeAttribute('data-type');
                });

                // Tempatkan rumah mewah di petak kiri atas
                gameGrid[r1][c1] = 'rumah_mewah';
                const targetCell = gridContainer.children[getIndex(r1, c1)];
                targetCell.innerHTML = `<i class="fas ${itemInfo.rumah_mewah.icon}"></i>`;
                targetCell.dataset.type = 'rumah_mewah';

                // Update hitungan
                buildingCounts.rumah -= 4;
                buildingCounts.rumah_mewah++;
                jumlahRumah -= 4; // Kurangi jumlah rumah individu

                updateInfoPanel();
                foundSquare = true;
                break; // Hentikan loop setelah upgrade berhasil
            }
        }

        if (!foundSquare) {
            alert("Upgrade gagal. Pastikan Anda mengklik salah satu dari empat rumah yang membentuk bujur sangkar 2x2.");
        }
    }

    function eraseBuilding(cell, row, col) {
        const type = gameGrid[row][col]; // Ambil tipe dari gameGrid
        if (!type || type === 'eraser') return; // Tidak ada yang bisa dihapus atau mencoba menghapus eraser itu sendiri

        if (type === 'rumah_mewah') {
            // Kembalikan biaya upgrade dan 4 rumah
            const originalCost = itemInfo.rumah.biaya * 4;
            const upgradeCost = itemInfo.upgrade.biaya;
            sisaAnggaran += originalCost + upgradeCost;
            totalBiaya -= (originalCost + upgradeCost);
            buildingCounts.rumah_mewah--;

        } else if (type === 'rumah_mewah_part') {
            alert("Gunakan penghapus pada ikon utama untuk menghapus Rumah Mewah.");
            return;
        } else {
            // Logika penghapusan standar
            const item = itemInfo[type];
            sisaAnggaran += item.biaya;
            totalBiaya -= item.biaya;
            if(type === 'rumah') jumlahRumah--;

            if (buildingCounts.hasOwnProperty(type)) {
                buildingCounts[type]--;
            }
        }

        // Bersihkan grid internal dan tampilan sel
        gameGrid[row][col] = null;
        cell.innerHTML = '';
        cell.removeAttribute('data-type');
        updateInfoPanel();
    }

    function updateInfoPanel() {
        sisaAnggaranEl.textContent = `Rp. ${sisaAnggaran}`;
        totalBiayaEl.textContent = `Rp. ${totalBiaya}`;
        totalKeuntunganEl.textContent = `Rp. ${totalKeuntungan}`;
        countRumahEl.textContent = buildingCounts.rumah;
        countRumahMewahEl.textContent = buildingCounts.rumah_mewah;
        countTamanEl.textContent = buildingCounts.taman;
        countMushollahEl.textContent = buildingCounts.mushollah;
    }

    function selectTool(type, button) {
        // Jika ada bangunan yang sedang dipindahkan, kembalikan ke posisi semula
        if (isMoving) {
            revertMove();
            isMoving = false;
            movingBuilding = null;
            gridContainer.style.cursor = 'pointer';
        }

        selectedTool = type;
        const buttons = buildingButtonsContainer.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
    }

    function updateBuildingInfoPanel(type) {
        if (!type || type === 'eraser') {
            buildingInfoPanel.innerHTML = '<p>Arahkan kursor ke bangunan untuk melihat detail.</p>';
            return;
        }

        const item = itemInfo[type];
        let infoHTML = `<p><strong>${type.replace('_', ' ').toUpperCase()}</strong></p>`;
        infoHTML += `<p>Biaya: Rp. ${item.biaya}</p>`;
        
        if (item.nilaiJual > 0) {
            infoHTML += `<p>Nilai Jual: Rp. ${item.nilaiJual}</p>`;
        }

        if (item.effectPercentage) {
            const effectText = type === 'taman' || type === 'mushollah' 
                ? 'Pengurangan Waktu Jual:' 
                : 'Efek Konektivitas:';
            infoHTML += `<p>${effectText} ${item.effectPercentage * 100}%</p>`;
        }

        buildingInfoPanel.innerHTML = infoHTML;
    }

    function showPopup(popup) {
        popup.style.display = 'flex';
    }

    function hidePopup(popup) {
        popup.style.display = 'none';
    }

    function simulateSale() {
        console.log("simulateSale() called.");
        
        let totalSellingTime = 0;
        let sellableHouses = 0;
        let sellableMewah = 0;

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const building = gameGrid[r][c];
                if (building === 'rumah' || building === 'rumah_mewah') {
                    if (isConnectedToRoad(r, c)) {
                        let itemData, sellableCounter;
                        if (building === 'rumah') {
                            sellableHouses++;
                            itemData = itemInfo.rumah;
                        } else {
                            sellableMewah++;
                            itemData = itemInfo.rumah_mewah;
                        }

                        let houseSellingTime = itemData.baseSellingTime;
                        let totalReductionPercentage = 0;

                        for (let r2 = 0; r2 < gridSize; r2++) {
                            for (let c2 = 0; c2 < gridSize; c2++) {
                                const facilityType = gameGrid[r2][c2];
                                if (facilityType && (facilityType === 'taman' || facilityType === 'jalan_utama' || facilityType === 'jalan_sekunder' || facilityType === 'mushollah')) {
                                    const distance = calculateDistance(r, c, r2, c2);
                                    if (distance > 0) {
                                        const itemEffect = itemInfo[facilityType].effectPercentage;
                                        const decay = distance * DISTANCE_DECAY_PER_GRID;
                                        const actualEffect = Math.max(0, itemEffect - decay);
                                        totalReductionPercentage += actualEffect;
                                    }
                                }
                            }
                        }
                        
                        houseSellingTime *= (1 - Math.min(1, totalReductionPercentage));
                        totalSellingTime += Math.max(1, Math.round(houseSellingTime));
                    } else {
                        console.log(`${building} di (${r},${c}) tidak terhubung dengan jalan dan tidak dapat dijual.`);
                    }
                }
            }
        }

        const totalSellableUnits = sellableHouses + sellableMewah;
        if (totalSellableUnits === 0) {
            alert("Tidak ada rumah yang terhubung dengan jalan. Bangun rumah dan pastikan terhubung dengan jalan agar bisa dijual!");
            return;
        }

        const loadingDurationMs = totalSellingTime * DAYS_TO_SECONDS_RATIO * 1000; 
        let startTime = Date.now();

        showPopup(loadingPopup);
        progressBarFill.style.width = '0%';
        progressText.textContent = `0 hari`;

        let animationFrameId; // Variabel untuk menyimpan ID animasi frame

        const updateProgress = () => {
            const elapsedTime = Date.now() - startTime;
            let progressDays = (elapsedTime / (DAYS_TO_SECONDS_RATIO * 1000));
            if (progressDays > totalSellingTime) progressDays = totalSellingTime;

            const progressPercentage = (progressDays / totalSellingTime) * 100;
            const currentSoldUnits = Math.min(totalSellableUnits, Math.floor(totalSellableUnits * (progressDays / totalSellingTime)));
            soldUnitsCount.textContent = currentSoldUnits;

            progressBarFill.style.width = `${progressPercentage}%`;
            progressText.textContent = `${Math.round(progressDays)} hari`;

            if (progressDays < totalSellingTime) {
                animationFrameId = requestAnimationFrame(updateProgress);
            } else {
                showSummary();
            }
        };

        const showSummary = () => {
            hidePopup(loadingPopup);
            const finalTotalPenjualan = (sellableHouses * itemInfo.rumah.nilaiJual) + (sellableMewah * itemInfo.rumah_mewah.nilaiJual);
            const rumahTidakTerjual = buildingCounts.rumah - sellableHouses;
            const mewahTidakTerjual = buildingCounts.rumah_mewah - sellableMewah;
            const kerugian = (itemInfo.rumah.biaya * rumahTidakTerjual) + (itemInfo.rumah_mewah.biaya * mewahTidakTerjual);
            const finalTotalKeuntungan = finalTotalPenjualan - totalBiaya - kerugian;
            const PENALTY_FACTOR = 4; // Faktor penalti yang disarankan
            const overallScore = finalTotalKeuntungan - (totalSellingTime * PENALTY_FACTOR);

            // Update developer's capital, total score, and total play time in localStorage
            activeDeveloper.capital += finalTotalKeuntungan;
            activeDeveloper.totalScore = (activeDeveloper.totalScore || 0) + overallScore;
            activeDeveloper.totalPlayTime = (activeDeveloper.totalPlayTime || 0) + totalSellingTime;
            developerProfiles[activeDeveloperIndex] = activeDeveloper;
            localStorage.setItem('developerProfiles', JSON.stringify(developerProfiles));

            document.getElementById('summary-modal').textContent = `Rp. ${formatNumberWithThousandsSeparator(totalBiaya)}`;
            document.getElementById('summary-terjual').textContent = formatNumberWithThousandsSeparator(sellableHouses);
            document.getElementById('summary-penjualan').textContent = `Rp. ${formatNumberWithThousandsSeparator(finalTotalPenjualan)}`;
            document.getElementById('summary-tidak-terjual').textContent = formatNumberWithThousandsSeparator(rumahTidakTerjual);
            document.getElementById('summary-kerugian').textContent = `Rp. -${formatNumberWithThousandsSeparator(kerugian)}`;
            document.getElementById('summary-keuntungan').textContent = `Rp. ${finalTotalKeuntungan >= 0 ? '+' : ''}${formatNumberWithThousandsSeparator(finalTotalKeuntungan)}`;
            document.getElementById('summary-waktu').textContent = formatNumberWithThousandsSeparator(totalSellingTime);
            document.getElementById('summary-score').textContent = formatNumberWithThousandsSeparator(overallScore);
            showPopup(summaryPopup);
        };

        requestAnimationFrame(updateProgress);

        skipButton.onclick = () => {
            cancelAnimationFrame(animationFrameId);
            showSummary();
        };
    }

    buildingButtonsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) {
            const toolType = button.dataset.type;
            selectTool(toolType, button);
        }
    });

    buildingButtonsContainer.addEventListener('mouseover', (e) => {
        const button = e.target.closest('button');
        if (button) {
            const toolType = button.dataset.type;
            updateBuildingInfoPanel(toolType);
        }
    });

    buildingButtonsContainer.addEventListener('mouseout', () => {
        updateBuildingInfoPanel(null); // Reset panel when mouse leaves the container
    });

    clearButton.addEventListener('click', () => {
        if (confirm("Apakah Anda yakin ingin membersihkan semua bangunan?")) {
            resetGame();
        }
    });

    if (sellButton) {
        sellButton.addEventListener('click', simulateSale);
    } else {
        console.error("Elemen tombol Jual tidak ditemukan!");
    }

    if (menuButton) {
        menuButton.addEventListener('click', () => showPopup(menuPopup));
    }

    if (rulesButton) {
        rulesButton.addEventListener('click', () => {
            hidePopup(menuPopup); // Sembunyikan menu utama
            showPopup(rulesPopup); // Tampilkan pop-up aturan
        });
    }

    if (closeRulesPopup) {
        closeRulesPopup.addEventListener('click', () => hidePopup(rulesPopup));
    }

    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', toggleFullscreen);
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    const resumeGameButton = menuPopup.querySelector('button');
    if (resumeGameButton) {
        resumeGameButton.addEventListener('click', () => hidePopup(menuPopup));
    }

    closeSummaryButton.addEventListener('click', () => {
        hidePopup(summaryPopup);
        localStorage.setItem('showDeveloperDetail', 'true'); // Set flag
        window.location.href = 'dashboard.html';
    });

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchmove', handleTouchMove);

    resetGame();
}
