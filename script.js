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

    // Elemen untuk menampilkan jumlah bangunan
    const countRumahEl = document.getElementById('count-rumah');
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
    let buildingCounts = { rumah: 0, taman: 0, mushollah: 0 }; // Penghitung bangunan

    // Variabel untuk fitur drag-and-drop
    let isDragging = false;
    let lastProcessedCell = null; // Untuk mencegah pemrosesan sel yang sama berulang kali saat drag

    // Konstanta untuk perhitungan waktu penjualan
    const DISTANCE_DECAY_PER_GRID = 0.01; // 1% pengurangan efek per jarak 1 grid
    const DAYS_TO_SECONDS_RATIO = 0.3; // 1 hari = 0.3 detik

    const itemInfo = {
        rumah: { biaya: 50, nilaiJual: 120, baseSellingTime: 30, icon: 'fa-home' }, // 30 hari standar
        taman: { biaya: 5, nilaiJual: 0, effectPercentage: 0.15, icon: 'fa-tree' }, // 15% pengurangan waktu
        jalan_utama: { biaya: 2, nilaiJual: 0, effectPercentage: 0.02, type: 'road', blockClass: 'jalan-block-utama' }, // 2% pengurangan waktu
        jalan_sekunder: { biaya: 1, nilaiJual: 0, effectPercentage: 0.01, type: 'road', blockClass: 'jalan-block-sekunder' }, // 1% pengurangan waktu
        mushollah: { biaya: 50, nilaiJual: 0, effectPercentage: 0.25, icon: 'fa-mosque' }, // 25% pengurangan waktu
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
        buildingCounts = { rumah: 0, taman: 0, mushollah: 0 }; // Reset penghitung
        
        // Inisialisasi gameGrid
        gameGrid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(null));

        createGrid(); // Buat ulang tampilan grid
        updateInfoPanel();
        const buttons = buildingButtonsContainer.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('selected'));
    }

    function createGrid() {
        gridContainer.innerHTML = '';
        gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, 40px)`;
        gridContainer.style.gridTemplateRows = `repeat(${gridSize}, 40px)`;
        for (let i = 0; i < gridSize * gridSize; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.index = i;
            // Event listener untuk drag-and-drop
            cell.addEventListener('mousedown', (e) => { if (e.button === 0) handleMouseDown(e, cell); });
            cell.addEventListener('mouseover', () => handleMouseOver(cell));
            gridContainer.appendChild(cell);
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
        if (!selectedTool) {
            alert("Pilih bangunan atau penghapus terlebih dahulu.");
            return;
        }
        isDragging = true;
        processCellAction(cell, true); // True untuk showAlert pada klik awal
        lastProcessedCell = cell;
    }

    // Fungsi untuk melanjutkan aksi saat drag
    function handleMouseOver(cell) {
        if (!isDragging || cell === lastProcessedCell) {
            return;
        }
        processCellAction(cell, false); // False untuk tidak showAlert saat drag
        lastProcessedCell = cell;
    }

    // Fungsi untuk mengakhiri aksi drag
    function handleMouseUp() {
        isDragging = false;
        lastProcessedCell = null;
    }

    // Fungsi utama untuk memproses aksi pada sel (place atau erase)
    function processCellAction(cell, showAlert) {
        const { row, col } = getCoords(parseInt(cell.dataset.index));

        if (selectedTool === 'eraser') {
            eraseBuilding(cell, row, col);
        } else {
            if (gameGrid[row][col]) {
                if (showAlert) {
                    alert("Petak ini sudah terisi. Gunakan penghapus untuk membersihkannya.");
                }
                return;
            }
            placeBuilding(cell, row, col);
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

    function eraseBuilding(cell, row, col) {
        const type = gameGrid[row][col]; // Ambil tipe dari gameGrid
        if (!type || type === 'eraser') return; // Tidak ada yang bisa dihapus atau mencoba menghapus eraser itu sendiri

        const item = itemInfo[type];
        
        // Kembalikan biaya ke anggaran
        sisaAnggaran += item.biaya;
        totalBiaya -= item.biaya;
        totalKeuntungan -= (item.nilaiJual - item.biaya);
        if(type === 'rumah') jumlahRumah--;

        // Update buildingCounts
        if (buildingCounts.hasOwnProperty(type)) {
            buildingCounts[type]--;
        }

        // Bersihkan gameGrid internal
        gameGrid[row][col] = null;

        // Bersihkan tampilan sel
        cell.innerHTML = '';
        cell.removeAttribute('data-type');
        updateInfoPanel();
    }

    function updateInfoPanel() {
        sisaAnggaranEl.textContent = `Rp. ${sisaAnggaran}`;
        totalBiayaEl.textContent = `Rp. ${totalBiaya}`;
        totalKeuntunganEl.textContent = `Rp. ${totalKeuntungan}`;
        countRumahEl.textContent = buildingCounts.rumah;
        countTamanEl.textContent = buildingCounts.taman;
        countMushollahEl.textContent = buildingCounts.mushollah;
    }

    function selectTool(type, button) {
        selectedTool = type;
        const buttons = buildingButtonsContainer.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
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

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                if (gameGrid[r][c] === 'rumah') {
                    if (isConnectedToRoad(r, c)) {
                        sellableHouses++;
                        let houseSellingTime = itemInfo.rumah.baseSellingTime; // Waktu dasar 30 hari
                        let totalReductionPercentage = 0;

                        for (let r2 = 0; r2 < gridSize; r2++) {
                            for (let c2 = 0; c2 < gridSize; c2++) {
                                const buildingType = gameGrid[r2][c2];
                                if (buildingType && (buildingType === 'taman' || buildingType === 'jalan_utama' || buildingType === 'jalan_sekunder' || buildingType === 'mushollah')) {
                                    const distance = calculateDistance(r, c, r2, c2);
                                    if (distance > 0) { // Pastikan bukan sel rumah itu sendiri
                                        const itemEffect = itemInfo[buildingType].effectPercentage;
                                        const decay = distance * DISTANCE_DECAY_PER_GRID;
                                        const actualEffect = Math.max(0, itemEffect - decay); // Efek tidak bisa negatif
                                        totalReductionPercentage += actualEffect;
                                    }
                                }
                            }
                        }
                        
                        houseSellingTime *= (1 - Math.min(1, totalReductionPercentage));
                        totalSellingTime += Math.max(1, Math.round(houseSellingTime)); // Akumulasi waktu penjualan
                    } else {
                        console.log(`Rumah di (${r},${c}) tidak terhubung dengan jalan dan tidak dapat dijual.`);
                    }
                }
            }
        }

        if (sellableHouses === 0) {
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
            const currentSoldUnits = Math.min(sellableHouses, Math.floor(sellableHouses * (progressDays / totalSellingTime)));
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
            const finalTotalPenjualan = sellableHouses * itemInfo.rumah.nilaiJual;
            const rumahTidakTerjual = jumlahRumah - sellableHouses;
            const kerugian = itemInfo.rumah.biaya * rumahTidakTerjual;
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

    resetGame();
}
