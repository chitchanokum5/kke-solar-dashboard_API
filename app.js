// Google Sheets Solar Inverter Dashboard Logic

// Constants
const SHEET_CSV_URL = 'inverter_report.csv';
const ITEMS_PER_PAGE = 15;

// State management
let rawData = []; // Full parsed CSV array
let inverterData = []; // Array of objects representing inverters
let filteredData = []; // Data after filters and search applied
let groupedData = []; // Data grouped by site after filters and search applied
let currentPage = 1;
let currentSort = { column: 'total', direction: 'desc' };
let maxDailyValueGlobal = 1; // Used for heatmap scaling
let currentCategory = 'all'; // 'all', 'ppa', 'epc'
let siteTargets = {}; // Map of siteName (lowercase) -> targets
let allConfigTargets = []; // List of all raw parsed targets from config.csv

// PPA Sites list to distinguish from EPC
const PPA_SITES = new Set([
    "a-pla", "bo-thongrubber", "ccp ph.1", "ccp ph.2", "cps", "fairy plaza kk",
    "hexa ceram", "jipata", "kantang ph.1", "kantang ph.2", "ku-thong", "kwm ph.1",
    "kwm ph.2", "kwm ph.3", "loapattana", "mitsu chumphae", "mitsu khonkaen ph.1",
    "mitsu khonkaen ph.2", "nachitec ph.1", "nachitec ph.2", "nissan kkt", "ntec ph.1",
    "ntec ph.2", "pcc", "poomsuk", "procare", "ptt chester grill", "ptt e1", "ptt e2",
    "ptt e3", "ptt e5", "r89", "rc farm ph.1", "rc farm ph.2", "samchai",
    "srisakol pure rice mill", "t.p.k. asian foods", "thongthai ph.1", "thongthai ph.2",
    "thongthai ph.3", "thongtong rubber", "toyota buriram", "toyota head office",
    "toyota kaennakorn", "toyota loei", "toyota maliwan", "toyota srichan", "vgreen",
    "wiremesh chonburi", "wiremesh khon kaen", "wiremesh khonkaen", "wiremesh korat",
    "kke_ttt"
]);

// Map of system station names (returned by API) to config site name(s) in config.csv
const SYSTEM_TO_CONFIG_MAP = {
    "โรงสี ต.ไทยเจริญ": ["โรงสี ต.ไทยเจริญ"],
    "หจก. โรงน้ำแข็งจำนงรัตน์ SolarFarm 371.80kWp.": ["Jamnongrat Ice Factory"],
    "โรงสีศรีสกลเพียวไรซ์": ["Srisakol Pure Rice Mill"],
    "วิทยาลัยเทคโนโลยีภาคตะวันออกเฉียงเหนือ": ["North Eastern Technological College"],
    "สหกรณ์ บ่อทอง": ["BO-thongrubber"],
    "ปลาร้าแแม่เหรียญ ( สาขา1 )": ["Mae Rien Fish Sauce"],
    "สินทองไทย รับเบอร์": ["Sin thong Thai Rubber"],
    "โชควัฒนาก่อสร้าง 265.54kWp": ["CHOKWATANA"],
    "YK SD SOLAR ENERGY": ["YKSD solar"],
    "KKE_TTT": ["Thongthai Ph.1,2,3"],
    "TEM Building A": ["TEM A"],
    "TEM Building B": ["TEM B"],
    "TEM Building C": ["TEM C"],
    "Nachitec": ["Nachitec"],
    "Nachitec Ph.1": ["Nachitec"],
    "KANTANG 1": ["KANTANG Ph.1"],
    "KANTANG 2": ["KANTANG Ph.2"],
    "Rc farm 1": ["RC Farm Ph.1"],
    "Rc Farm 2": ["RC Farm Ph.2"],
    "KFI Phase 2": ["KFI Ph.2"],
    "KKF(KFI)_l": ["KFI Ph.1"],
    "YPB Chum Phae": ["Mitsu ChumPhae"],
    "YPB Khonkaen 1": ["Mitsu KhonKaen Ph.1"],
    "YPB Khonkaen 2": ["Mitsu KhonKaen Ph.2"],
    "KKF BWC V2": ["BWC Ph.1"],
    "KKF BWC V2 Phase2": ["BWC Ph.2"],
    "Offline KKF(BWC)": ["BWC"],
    "YPB  Khonkaen 2": ["Mitsu KhonKaen Ph.2"],
    "LUANGSIRI RUBBER Phase 2": ["Luangsiri Ph.2"],
    "LUANGSIRI RUBBER Phase 1": ["Luangsiri Ph.1"],
    "AMW": ["Auto Motion Work"],
    "Chawalit Rice 316.80kWp.": ["Chawalit Rice"],
    "TIA LIANG 532.00 kWp": ["TIA LIANG"],
    "Prime beverage co. ltd": ["Prime"],
    "KKF(CY)_ll": ["CY Ph.2"],
    "คลัง KKF": ["Warehouse KKF"],
    "J.Filter 82.94 kWp": ["J.Filter"],
    "The Carpet Maker 336 kWp": ["The Carpet Maker"],
    "SAMCHAI STEEL 504.00 kWp": ["SAMCHAI"],
    "Alumet EXT-04 635.04 kWp.": ["Alumet Meter3"],
    "GTS 198.80 kWp.": ["GTS"],
    "KINGWATER GROUP 241.92 kWp": ["King Water GROUP"],
    "NR Phase 3": ["NR Ph. 3"],
    "Sunfood Rooftop 1,487.20 kWp": ["Sun Food"],
    "PVO - DF3 BUILDING 739.8kWp": ["PVO - DF3 BUILDING"],
    "TPS Garden Furniture 199.50 kWp.": ["TPS Ph.1"],
    "Sun flour 1": ["Sun flour Ph.1"],
    "KKF(CY)_l": ["CY Ph.1"],
    "Alumet ANO PDC 771.12 kWp.": ["Alumet Meter2"],
    "CCP1 v.2": ["CCP Ph.1"],
    "robinson lopburi": ["Robison Lopburi"],
    "NR-FRAM": ["NR Farm"],
    "PHATTANAKIT WOODCHIP CO.,LTD.": ["PHATTANAKIT WOOD"],
    "Alumet EXT-01 EXT-02 595.98 kWp.": ["Alumet Meter1"],
    "PVO - CANTEEN BUILDING 82.2kWp": ["PVO CANTEEN BUILDING"],
    "Sentosa Khonkaen(Sila)": ["Sentosa\u00a0Khonkaen(Sila)"],
    "Super Scales 154.44 kWp.": ["Super Scales"],
    "Thai Rokuha 249.92 kWp": ["Thai Rokuha"],
    "Crinic korat": ["Dialysis Clinic"],
    "TER2 114.38 kWp": ["TER Ph.2"],
    "PETPAL SOLAR ROOFTOP 999.6 kWp": ["PETPAL"],
    "TER 133.00 kWp": ["TER Ph.1"],
    "PVO - HEAD OFFICE 68.5kWp": ["PVO HEAD OFFICE"],
    "Unity Harness Limited": ["Unity Harness"],
    "DEK SOM BOON(DC1)": ["DEK SOM BOON"],
    "Buatip Farm 772.20 kwp": ["Buatip"],
    "Roland digital": ["Roland Digital Group"],
    "TTL3-886.08 kWp": ["TTL3"],
    "PVO - ENGINEERING BUILDING 411.0kWp": ["PVO - ENGINEERING"],
    "Siam Chicken Product": ["Siam Chicken"],
    "Robinson Srisaman Rev.2": ["Robison Srisaman"],
    "THEPMANEE COLDSTORAGE [CHANTHABURI]": ["THEPMANEE COLDSTORAGE"],
    "AAG Corporation": ["AAG"],
    "Pisamai Solarroof 112 kWp": ["Pisamai"],
    "โรงสีศรีสกลเพียวไรซ์": ["Srisakol Pure Rice Mill"],
    "TOYOTA KHONKAEN HEAD OFFICE": ["TOYOTA HEAD OFFICE"],
    "CY Phase 3": ["CY Ph.3"],
    "โชควัฒนาก่อสร้าง 265.54kWp": ["CHOKWATANA"],
    "APC 142 kWp": ["APC"],
    "RIKA JTW HEAT TREATMENT SOLAR ROOFTOP 1329.90kW": ["RIKA"],
    "TOA PAINT": ["TOA"],
    "[BYD]PI-R MOTOR KHON KAEN SOLAR ROOFTOP": ["BYD"],
    "N-TEQ": ["Ntec"],
    "Ntec Ph.1": ["Ntec"],
    "Schavakon 298.20 kWp": ["Schavakon"],
    "CY phase 4": ["CY Ph.4+5"],
    "E.Q. RUBBER SOLAR ROOFTOP 1.33 MWp": ["E.Q. RUBBER"],
    "PHATTHANA FROZEN FOOD SAMUTSAKHON": ["PHATTHANA FROZEN"],
    "A-PLA HIGHTECH(Branch 2)": ["A-PLA"],
    "AREECHAI WOODTECH 371.8 kWp": ["AREECHAI WOODTECH"],
    "Sunfood Farm 1_3,163.16 kWp": ["Sun Food"],
    "TPS Garden Furniture 106.40 kWp.": ["TPS Ph.2"],
    "TEM Building A": ["TEM A"],
    "TEM Building C": ["TEM C"],
    "CCP2": ["CCP Ph.2"],
    "Sunfood Farm 2_3,071.64 kWp": ["Sun Food"],
    "PYK. TOOL AND DIE 113.60 kWp": ["PYK. TOOL AND DIE"],
    "KKF": ["KKF Ph.2"],
    "First Confectionery602": ["First Confectionery"],
    "BMC 138.60 kWp (Eternal Resonac Materials)": ["BMC (Eternal Resin)"],
    "IJTT-HEAD OFFICE": ["IJTT"],
    "KWM": ["KWM Ph.1,2,3"],
    "PTT CG": ["PTT chester grill"]
};

// Chart instances
let dailyTrendChart = null;
let siteDistributionChart = null;
let targetComparisonChart = null;
let chartPeriod = 'daily'; // 'daily' or 'monthly'
let chartSelectedSite = 'all';

// DOM Elements
const chartSiteSelect = document.getElementById('chart-site-select');
const btnChartHourly = document.getElementById('btn-chart-hourly');
const btnChartDaily = document.getElementById('btn-chart-daily');
const btnChartMonthly = document.getElementById('btn-chart-monthly');
const alarmContainer = document.getElementById('alarm-container');
const alarmCountBadge = document.getElementById('alarm-count-badge');
const loader = document.getElementById('loader');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const errorRetry = document.getElementById('error-retry');
const lastUpdated = document.getElementById('last-updated');
const refreshBtn = document.getElementById('refresh-btn');
const themeToggle = document.getElementById('theme-toggle');

// KPI elements
const kpiTotalGen = document.getElementById('kpi-total-gen');
const kpiActiveSites = document.getElementById('kpi-active-sites');
const kpiTotalInverters = document.getElementById('kpi-total-inverters');
const kpiPeakDay = document.getElementById('kpi-peak-day');
const kpiPeakDayLabel = document.getElementById('kpi-peak-day-label');
const kpiDailyTargetPct = document.getElementById('kpi-daily-target-pct');
const kpiDailyTargetVal = document.getElementById('kpi-daily-target-val');
const kpiMonthlyTargetPct = document.getElementById('kpi-monthly-target-pct');
const kpiMonthlyTargetVal = document.getElementById('kpi-monthly-target-val');

// Filter elements
const filterSite = document.getElementById('filter-site');
const filterInverter = document.getElementById('filter-inverter');
const searchInput = document.getElementById('search-input');
const clearFiltersBtn = document.getElementById('clear-filters');

// Table elements
const dataTable = document.getElementById('data-table');
const tableBody = document.getElementById('table-body');
const tableCountBadge = document.getElementById('table-count-badge');
const toggleHeatmap = document.getElementById('toggle-heatmap');
const exportCsvBtn = document.getElementById('export-csv-btn');

// Database view elements
const dbTableBody = document.getElementById('db-table-body');
const dbSearch = document.getElementById('db-search');
const dbFilterType = document.getElementById('db-filter-type');

// Pagination elements
const pageStart = document.getElementById('page-start');
const pageEnd = document.getElementById('page-end');
const totalRows = document.getElementById('total-rows');
const prevPage = document.getElementById('prev-page');
const nextPage = document.getElementById('next-page');
const pageNumberDisplay = document.getElementById('page-number-display');

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDashboardData();
    setupEventListeners();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

function toggleTheme() {
    if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        localStorage.setItem('theme', 'dark');
    }
    // Re-render charts to adjust styles for theme changes
    updateCharts();
}

function showToast(message, isSuccess = true) {
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.background = isSuccess ? '#00e676' : '#ff1744';
    notification.style.color = '#fff';
    notification.style.padding = '12px 24px';
    notification.style.borderRadius = '8px';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.zIndex = '9999';
    notification.style.fontFamily = 'Prompt, sans-serif';
    notification.style.fontWeight = '600';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function getCacheBustedUrl(url) {
    return url + '?t=' + new Date().getTime();
}

async function handleRefreshClick() {
    showLoader(true);
    
    // Check if we are running locally or on the cloud
    const isLocal = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' || 
                    window.location.hostname === '';
                    
    if (isLocal) {
        lastUpdated.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังดึงข้อมูลจาก FusionSolar...`;
        try {
            const syncResponse = await fetch('/api/sync', { method: 'POST' });
            if (!syncResponse.ok) {
                throw new Error(`Sync server responded with status: ${syncResponse.status}`);
            }
            const syncResult = await syncResponse.json();
            if (!syncResult.success) {
                throw new Error(syncResult.message || 'Sync failed');
            }
            await loadDashboardData();
            showToast(syncResult.message || 'ดึงข้อมูลสำเร็จ!');
        } catch (error) {
            console.error('Refresh sync error:', error);
            alert('เกิดข้อผิดพลาดในการดึงข้อมูลจาก FusionSolar: ' + error.message);
            await loadDashboardData();
        }
    } else {
        // Cloud mode (e.g. Vercel): Refresh from Vercel static assets with cache busting
        lastUpdated.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังโหลดข้อมูลล่าสุดจากคลาวด์...`;
        try {
            await loadDashboardData();
            showToast('รีเฟรชและโหลดข้อมูลล่าสุดจากคลาวด์แล้ว!');
        } catch (error) {
            console.error('Refresh load error:', error);
            showToast('การรีเฟรชข้อมูลล้มเหลว', false);
            showLoader(false);
        }
    }
}

// Event Listeners Setup
function setupEventListeners() {
    refreshBtn.addEventListener('click', handleRefreshClick);
    themeToggle.addEventListener('click', toggleTheme);
    errorRetry.addEventListener('click', handleRefreshClick);
    
    // Navigation Menu Item switcher
    document.querySelectorAll('.nav-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-menu-item').forEach(nav => nav.classList.remove('active'));
            const clicked = e.currentTarget;
            clicked.classList.add('active');
            
            const viewId = clicked.getAttribute('data-view');
            
            document.querySelectorAll('.page-view').forEach(view => {
                view.classList.add('hidden');
            });
            
            const targetView = document.getElementById(`view-${viewId}`);
            if (targetView) {
                targetView.classList.remove('hidden');
            }
            
            if (viewId === 'production') {
                setTimeout(() => {
                    updateCharts();
                }, 50);
            }
            if (viewId === 'database') {
                renderDatabaseTable();
            }
        });
    });

    // Category Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            currentCategory = target.getAttribute('data-category');
            
            // Reset filters when switching categories
            filterSite.value = 'all';
            filterInverter.value = 'all';
            
            populateSiteFilter();
            populateInverterFilter();
            applyFilters();
        });
    });

    // Filters
    filterSite.addEventListener('change', () => {
        populateInverterFilter();
        applyFilters();
    });
    filterInverter.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', applyFilters);
    clearFiltersBtn.addEventListener('click', clearFilters);
    
    // Target Chart Site Filter
    if (chartSiteSelect) {
        chartSiteSelect.addEventListener('change', (e) => {
            chartSelectedSite = e.target.value;
            updateTargetComparisonChart();
        });
    }
    
    // Heatmap toggle
    toggleHeatmap.addEventListener('change', renderTable);
    
    // Export CSV
    exportCsvBtn.addEventListener('click', exportCSV);
    
    // Sorting headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const sortBy = th.getAttribute('data-sort');
            if (currentSort.column === sortBy) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = sortBy;
                currentSort.direction = 'desc'; // Default to high-to-low
            }
            
            // Update sort icons
            document.querySelectorAll('th.sortable i').forEach(icon => {
                icon.className = 'fa-solid fa-sort';
            });
            const icon = th.querySelector('i');
            icon.className = `fa-solid fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
            
            sortFilteredData();
            currentPage = 1;
            renderTable();
        });
    });
    
    // Pagination
    prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    
    nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
    
    // Target Database search and filter event listeners
    if (dbSearch && dbFilterType) {
        dbSearch.addEventListener('input', renderDatabaseTable);
        dbFilterType.addEventListener('change', renderDatabaseTable);
    }
}

// Fetch Target Configuration Data
async function loadTargets() {
    try {
        const configUrl = getCacheBustedUrl('config.csv');
        const response = await fetch(configUrl);
        if (!response.ok) throw new Error("Failed to fetch configuration sheet");
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        siteTargets = {};
        allConfigTargets = [];
        
        // Helper to register a target and all its aliases
        const registerTarget = (siteName, targetObj) => {
            const normSite = normalizeSiteName(siteName);
            if (!normSite) return;
            
            siteTargets[normSite] = targetObj;
            
            // Add spelling variation aliases
            if (normSite === 'wiremesh khon kaen') {
                siteTargets['wiremesh khonkaen'] = targetObj;
            }
            if (normSite === 'tem a') {
                siteTargets['tem building a'] = targetObj;
            }
            if (normSite === 'bulk (eternal resin)') {
                siteTargets['bulk 110.88 kwp (eternal resin)'] = targetObj;
            }
            if (normSite === 'eternal resin') {
                siteTargets['wh01 888.30 kwp (eternal resin)'] = targetObj;
                siteTargets['wh01 888.30kwp (eternal resin)'] = targetObj;
            }
            if (normSite === 'alumet meter 1') {
                siteTargets['alumet meter1'] = targetObj;
            }
            if (normSite === 'alumet meter 2') {
                siteTargets['alumet meter2'] = targetObj;
            }
            if (normSite === 'alumet meter 3') {
                siteTargets['alumet meter3'] = targetObj;
            }
            if (normSite === 'suksomboon farm') {
                siteTargets['suksomboon'] = targetObj;
            }
            if (normSite === 'bwc ph.1') {
                siteTargets['bwc ph.2'] = targetObj;
                siteTargets['bwc'] = targetObj;
            }
        };

        // Find current month row in config.csv to load month-specific targets dynamically
        const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' }); // e.g. "July"
        let monthRow = null;
        for (let i = 3; i < 15; i++) {
            if (rows[i] && rows[i][25] && rows[i][25].trim().toLowerCase() === currentMonthName.toLowerCase()) {
                monthRow = rows[i];
                break;
            }
        }
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

        // Loop through rows after the header rows (start from row index 3 which is the 4th row)
        for (let i = 3; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 10) continue;
            
            // PPA site parsing (columns 4, 6, and 9)
            const ppaSite = row[4] || '';
            const ppaDailyTarget = parseFloat((row[9] || '').replace(/,/g, ''));
            const ppaCapacity = parseFloat((row[6] || '').replace(/,/g, ''));
            const ppaId = parseInt(row[3]);
            
            if (ppaSite && !isNaN(ppaDailyTarget)) {
                let monthlyTarget = ppaDailyTarget * daysInMonth;
                if (monthRow && !isNaN(ppaId)) {
                    // PPA columns start from index 25 (index 25 is Month name, index 26 is ID 2? Wait!
                    // Column 26 is index 25 in array, which contains ID 1 target)
                    const colIdx = 24 + ppaId;
                    if (colIdx < monthRow.length && monthRow[colIdx]) {
                        const parsedMonthly = parseFloat(monthRow[colIdx].replace(/,/g, ''));
                        if (!isNaN(parsedMonthly)) {
                            monthlyTarget = parsedMonthly;
                        }
                    }
                }
                
                const targetObj = {
                    siteName: ppaSite,
                    capacity: ppaCapacity,
                    dailyTarget: ppaDailyTarget,
                    monthlyTarget: monthlyTarget,
                    type: 'ppa'
                };
                registerTarget(ppaSite, targetObj);
                
                allConfigTargets.push({
                    id: isNaN(ppaId) ? '-' : ppaId,
                    siteName: ppaSite,
                    capacity: isNaN(ppaCapacity) ? 0 : ppaCapacity,
                    dailyTarget: isNaN(ppaDailyTarget) ? 0 : ppaDailyTarget,
                    monthlyTarget: isNaN(monthlyTarget) ? 0 : monthlyTarget,
                    type: 'PPA',
                    location: row[5] || '-',
                    tel: row[10] || '-'
                });
            }
            
            // EPC site parsing (columns 15, 17, and 20)
            if (row.length > 20) {
                const epcSite = row[15] || '';
                const epcDailyTarget = parseFloat((row[20] || '').replace(/,/g, ''));
                const epcCapacity = parseFloat((row[17] || '').replace(/,/g, ''));
                const epcId = parseInt(row[14]);
                
                if (epcSite && !isNaN(epcDailyTarget)) {
                    let monthlyTarget = epcDailyTarget * daysInMonth;
                    if (monthRow && !isNaN(epcId)) {
                        // EPC columns start from index 77 (index 76 is ID 1 target)
                        const colIdx = 75 + epcId;
                        if (colIdx < monthRow.length && monthRow[colIdx]) {
                            const parsedMonthly = parseFloat(monthRow[colIdx].replace(/,/g, ''));
                            if (!isNaN(parsedMonthly)) {
                                monthlyTarget = parsedMonthly;
                            }
                        }
                    }
                    
                    const targetObj = {
                        siteName: epcSite,
                        capacity: epcCapacity,
                        dailyTarget: epcDailyTarget,
                        monthlyTarget: monthlyTarget,
                        type: 'epc'
                    };
                    registerTarget(epcSite, targetObj);
                    
                    allConfigTargets.push({
                        id: isNaN(epcId) ? '-' : epcId,
                        siteName: epcSite,
                        capacity: isNaN(epcCapacity) ? 0 : epcCapacity,
                        dailyTarget: isNaN(epcDailyTarget) ? 0 : epcDailyTarget,
                        monthlyTarget: isNaN(monthlyTarget) ? 0 : monthlyTarget,
                        type: 'EPC',
                        location: row[16] || '-',
                        tel: row[21] || '-'
                    });
                }
            }
        }
        console.log("Loaded site targets map:", siteTargets);
        renderDatabaseTable();
    } catch (error) {
        console.error("Error loading targets config:", error);
    }
}

// Data Fetching and Loading
async function loadDashboardData() {
    if (window.location.protocol === 'file:') {
        errorMessage.innerHTML = 'ระบบถูกเปิดใช้งานผ่านการเปิดไฟล์โดยตรง (<code>file://</code>) ซึ่งเบราว์เซอร์จะบล็อกการโหลดข้อมูลเพื่อความปลอดภัย<br><br><strong>กรุณาเข้าใช้งานผ่านลิงก์นี้แทน: <a href="http://localhost:8000/" target="_blank" style="color: #1565c0; text-decoration: underline;">http://localhost:8000</a></strong>';
        showLoader(false);
        showError(true);
        lastUpdated.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> โหลดข้อมูลล้มเหลว`;
        return;
    }

    showLoader(true);
    showError(false);
    
    try {
        await loadTargets(); // Fetch targets first
        const response = await fetch(getCacheBustedUrl(SHEET_CSV_URL));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        
        // Parse CSV
        const parsed = parseCSV(csvText);
        if (parsed.length < 2) {
            throw new Error("No data found or spreadsheet is formatted incorrectly.");
        }
        
        processData(parsed);
        await loadAlarmData();
        showLoader(false);
        
        // Stamp timestamp
        const now = new Date();
        lastUpdated.innerHTML = `<i class="fa-solid fa-check-double"></i> อัปเดตล่าสุด: ${now.toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        errorMessage.textContent = 'ไม่สามารถดึงข้อมูลระบบได้: ' + error.message;
        showLoader(false);
        showError(true);
        lastUpdated.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> โหลดข้อมูลล้มเหลว`;
    }
}

function showLoader(show) {
    if (show) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// Load and Render Alarms & Abnormalities
async function loadAlarmData() {
    if (!alarmContainer || !alarmCountBadge) return;
    
    try {
        const response = await fetch(getCacheBustedUrl('alarm_report.csv'));
        if (!response.ok) {
            // If the file is not found (e.g. no alarms have ever run), treat it as 0 alarms
            renderAlarms([]);
            return;
        }
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        if (rows.length < 2) {
            renderAlarms([]);
            return;
        }
        
        const alarms = [];
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 5) continue;
            
            alarms.push({
                site: row[0] || 'ไม่ระบุไซต์',
                device: row[1] || 'อินเวอร์เตอร์',
                name: row[2] || 'ความผิดปกติ',
                severity: row[3] || 'คำเตือน (Warning)',
                time: row[4] || '-'
            });
        }
        
        renderAlarms(alarms);
    } catch (error) {
        console.error("Error loading alarms:", error);
        renderAlarms([]);
    }
}

function renderAlarms(alarms) {
    if (!alarmContainer || !alarmCountBadge) return;
    
    alarmContainer.innerHTML = '';
    
    if (alarms.length === 0) {
        alarmCountBadge.textContent = 'ปกติ';
        alarmCountBadge.className = 'count-badge status-normal';
        
        alarmContainer.innerHTML = `
            <div class="alarm-empty">
                <i class="fa-solid fa-circle-check" style="font-size: 1.25rem;"></i>
                <span>ระบบทำงานปกติ: ไม่พบสัญญาณเตือนหรือข้อผิดพลาดใดๆ ในระบบในรอบ 7 วันที่ผ่านมา</span>
            </div>
        `;
        return;
    }
    
    alarmCountBadge.textContent = `${alarms.length} รายการ`;
    alarmCountBadge.className = 'count-badge status-warning-badge';
    
    alarms.forEach(al => {
        const item = document.createElement('div');
        item.className = 'alarm-item';
        
        let severityClass = 'severity-warning';
        let severityIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        
        const sevLower = al.severity.toLowerCase();
        if (sevLower.includes('วิกฤต') || sevLower.includes('critical')) {
            severityClass = 'severity-critical';
            severityIcon = '<i class="fa-solid fa-radiation animate-pulse"></i>';
        } else if (sevLower.includes('รุนแรง') || sevLower.includes('major')) {
            severityClass = 'severity-major';
            severityIcon = '<i class="fa-solid fa-circle-exclamation"></i>';
        } else if (sevLower.includes('ปานกลาง') || sevLower.includes('minor')) {
            severityClass = 'severity-minor';
            severityIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        } else if (sevLower.includes('คำเตือน') || sevLower.includes('warning')) {
            severityClass = 'severity-warning';
            severityIcon = '<i class="fa-solid fa-circle-info"></i>';
        }
        
        // Translate custom offline alarms to Thai
        let alarmName = al.name;
        if (alarmName === "Station Offline (Communication Failure)") {
            alarmName = "สถานีออฟไลน์ / ขาดการติดต่อ (Station Offline)";
        } else if (alarmName === "Station Faulty (Partial Offline)") {
            alarmName = "สถานีพบข้อผิดพลาด / ออฟไลน์บางส่วน (Station Faulty)";
        }
        
        item.innerHTML = `
            <div class="alarm-item-severity ${severityClass}">
                ${severityIcon}
            </div>
            <div class="alarm-item-content">
                <div class="alarm-item-title">${alarmName}</div>
                <div class="alarm-item-meta">
                    <span><i class="fa-solid fa-industry"></i> ${al.site}</span>
                    <span><i class="fa-solid fa-microchip"></i> ${al.device}</span>
                    <span><i class="fa-solid fa-triangle-exclamation"></i> ${al.severity}</span>
                    <span><i class="fa-solid fa-clock"></i> ${al.time}</span>
                </div>
            </div>
        `;
        
        alarmContainer.appendChild(item);
    });
}

function renderDatabaseTable() {
    if (!dbTableBody) return;
    
    // Invert SYSTEM_TO_CONFIG_MAP to map config names back to FusionSolar names
    const CONFIG_TO_SYSTEM_MAP = {};
    for (const [sysName, configNames] of Object.entries(SYSTEM_TO_CONFIG_MAP)) {
        configNames.forEach(cfgName => {
            CONFIG_TO_SYSTEM_MAP[cfgName.toLowerCase().trim()] = sysName;
        });
    }
    
    const searchText = (dbSearch ? dbSearch.value : '').toLowerCase().trim();
    const filterType = dbFilterType ? dbFilterType.value : 'all';
    
    // Helper to get display name matching FusionSolar
    const getDisplayName = (siteName) => {
        if (!siteName) return '';
        const configKey = siteName.toLowerCase().trim();
        
        let foundSystemName = null;
        let sisterSitesCount = 0;
        
        for (const [sysName, configNames] of Object.entries(SYSTEM_TO_CONFIG_MAP)) {
            const matchingConfig = configNames.find(c => c.toLowerCase().trim() === configKey);
            if (matchingConfig) {
                foundSystemName = sysName;
                sisterSitesCount = configNames.length;
                break;
            }
        }
        
        if (foundSystemName) {
            if (sisterSitesCount > 1) {
                return `${foundSystemName} (${siteName})`;
            } else {
                return foundSystemName;
            }
        }
        
        // Capitalize Vgreen to VGreen to match FusionSolar exactly
        if (configKey === 'vgreen') return 'VGreen';
        
        return siteName;
    };
    
    // Create a Set of normalized active site names from the current API data
    const activeSitesSet = new Set(groupedData.map(g => normalizeSiteName(g.site)));
    
    // Filter targets
    const filtered = allConfigTargets.filter(item => {
        const sysName = getDisplayName(item.siteName);
        
        // Hide config targets that do not exist/are not active in the FusionSolar data
        const isSiteActive = activeSitesSet.has(normalizeSiteName(sysName)) || 
                             activeSitesSet.has(normalizeSiteName(item.siteName));
        if (!isSiteActive) return false;
        
        const matchesSearch = item.siteName.toLowerCase().includes(searchText) ||
                             sysName.toLowerCase().includes(searchText) ||
                             item.location.toLowerCase().includes(searchText);
        const matchesType = filterType === 'all' || item.type.toLowerCase() === filterType;
        return matchesSearch && matchesType;
    });
    
    dbTableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        dbTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
                    ไม่พบข้อมูลไซต์งานที่ตรงตามเงื่อนไข
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(item => {
        const tr = document.createElement('tr');
        
        const typeBadge = item.type === 'PPA' ? 
            `<span class="badge" style="background: rgba(33, 150, 243, 0.15); color: #2196f3; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; display: inline-block; width: 60px; text-align: center;">PPA</span>` :
            `<span class="badge" style="background: rgba(76, 175, 80, 0.15); color: #4caf50; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; display: inline-block; width: 60px; text-align: center;">EPC</span>`;
            
        const displayName = getDisplayName(item.siteName);
            
        tr.innerHTML = `
            <td style="text-align: center; font-weight: bold; color: var(--text-muted);">${item.id}</td>
            <td style="font-weight: 600; color: var(--text-color);">${displayName}</td>
            <td style="text-align: center;">${typeBadge}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: bold; color: var(--text-color);">${item.capacity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: bold; color: #2196f3;">${item.dailyTarget.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: bold; color: #4caf50;">${item.monthlyTarget.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td style="color: var(--text-muted);">${item.location}</td>
            <td style="color: var(--text-muted);">${item.tel}</td>
            <td style="text-align: center;">
                <button class="btn-edit" data-id="${item.id}" data-type="${item.type}" style="background: rgba(255, 235, 59, 0.1); color: #fbc02d; border: 1px solid rgba(255, 235, 59, 0.2); padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: bold; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                </button>
            </td>
        `;
        
        dbTableBody.appendChild(tr);
    });
}

function showError(show) {
    if (show) {
        errorBanner.classList.remove('hidden');
    } else {
        errorBanner.classList.add('hidden');
    }
}

// Clean and normalize site names to handle encoding corruptions, spaces, and hyphens
function normalizeSiteName(name) {
    if (!name) return '';
    return name
        .replace(/ย?[\s\u00a0]+/g, ' ')
        .replace(/[\s\u00a0]+ย?/g, ' ')
        .replace(/\s*-\s*/g, '-') // Normalize spacing around hyphens e.g. "Thai - Sup" -> "Thai-Sup"
        .trim()
        .toLowerCase();
}

// Resolve target from siteTargets, matching system station name to config site name(s)
function getSiteTarget(siteName) {
    if (!siteName) return null;
    const normSite = normalizeSiteName(siteName);
    
    // Check direct match
    if (siteTargets[normSite]) return siteTargets[normSite];
    
    // Check system-to-config map
    for (const sysName in SYSTEM_TO_CONFIG_MAP) {
        if (normalizeSiteName(sysName) === normSite) {
            const configNames = SYSTEM_TO_CONFIG_MAP[sysName];
            let combinedCapacity = 0;
            let combinedDailyTarget = 0;
            let foundAny = false;
            let isPpaType = false;
            
            configNames.forEach(cfgName => {
                const cfgTarget = siteTargets[normalizeSiteName(cfgName)];
                if (cfgTarget) {
                    combinedCapacity += cfgTarget.capacity || 0;
                    combinedDailyTarget += cfgTarget.dailyTarget || 0;
                    if (cfgTarget.type === 'ppa') {
                        isPpaType = true;
                    }
                    foundAny = true;
                }
            });
            
            if (foundAny) {
                const targetObj = {
                    siteName: sysName,
                    capacity: combinedCapacity || null,
                    dailyTarget: combinedDailyTarget,
                    monthlyTarget: combinedDailyTarget * 31,
                    type: isPpaType ? 'ppa' : 'epc'
                };
                // Cache it for subsequent lookups
                siteTargets[normSite] = targetObj;
                return targetObj;
            }
        }
    }
    
    return null;
}

// Custom CSV Parser that correctly handles newlines and escaped quotes inside quoted fields
function parseCSV(text) {
    const result = [];
    let row = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote: "" -> "
                currentValue += '"';
                i++; // Skip the next quote character
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Skip \n
            }
            row.push(currentValue.trim());
            result.push(row);
            row = [];
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    
    // Add final row if not empty
    if (row.length > 0 || currentValue) {
        row.push(currentValue.trim());
        result.push(row);
    }
    
    return result;
}

// Data Processing & Mapping
function processData(parsedRows) {
    if (parsedRows.length < 2) {
        throw new Error("ไม่มีข้อมูลการผลิตไฟฟ้าในระบบ!");
    }
    
    inverterData = [];
    maxDailyValueGlobal = 1;
    
    // Process inverter rows (starting from index 1, since index 0 is the header)
    for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        
        // Skip empty or short rows
        if (!row || row.length < 4) continue;
        
        const siteName = (row[0] || '').replace(/^\ufeff/, '').replace(/[\s\u00a0]+/g, ' ').trim();
        const deviceName = (row[1] || '').replace(/[\s\u00a0]+/g, ' ').trim();
        
        // Skip header/summary/empty rows
        if (!siteName && !deviceName) continue;
        
        // Skip numeric-only junk rows
        if (siteName && !isNaN(Number(siteName))) continue;
        if (deviceName && !isNaN(Number(deviceName))) continue;
        
        const isMetadata = (name) => {
            const lower = name.toLowerCase();
            return lower.includes('isolarcloud') || 
                   lower.includes('fusionsolar') || 
                   lower.includes('statistical') || 
                   lower.includes('irradiation') || 
                   lower.includes('temperature') ||
                   lower.includes('total') ||
                   lower.includes('average');
        };
        
        if (isMetadata(siteName)) continue;
        
        const capacityVal = parseFloat(row[2]) || null;
        
        // Days columns start from index 4 to index 34 (31 days)
        const dailyGen = [];
        let rowTotalGen = 0;
        
        for (let d = 4; d < row.length && d <= 34; d++) {
            const val = parseFloat(row[d]);
            if (!isNaN(val)) {
                dailyGen.push(val);
                rowTotalGen += val;
                if (val > maxDailyValueGlobal) {
                    maxDailyValueGlobal = val;
                }
            } else {
                dailyGen.push(0);
            }
        }
        
        // We only save rows that have a device name or a valid total generation
        if (deviceName || siteName) {
            if (!deviceName && rowTotalGen === 0) continue;
            
            const target = getSiteTarget(siteName);
            const isPPA = target ? target.type === 'ppa' : PPA_SITES.has(siteName.toLowerCase());
            inverterData.push({
                test: 'KKE',
                site: siteName || 'ไม่ระบุไซต์',
                device: deviceName || 'อินเวอร์เตอร์',
                capacity: capacityVal,
                daily: dailyGen,
                total: parseFloat(rowTotalGen.toFixed(2)),
                type: isPPA ? 'ppa' : 'epc'
            });
        }
    }
    
    // Dynamic table columns generation
    generateTableHeaders();
    
    // Filters population
    populateSiteFilter();
    populateInverterFilter();
    populateChartSiteSelect();
    
    // Initial Filter Apply
    applyFilters();
}

function generateTableHeaders() {
    const tableHeader = document.querySelector('#data-table thead tr');
    // Remove extra day columns if they already exist
    const baseHeaders = 6; // Site, Device, Capacity, Total, Target, Achievement
    while (tableHeader.children.length > baseHeaders) {
        tableHeader.removeChild(tableHeader.lastChild);
    }
    
    // Create headers for Days 1 to 31
    for (let day = 1; day <= 31; day++) {
        const th = document.createElement('th');
        th.className = 'text-right sortable';
        th.setAttribute('data-sort', `day-${day}`);
        th.innerHTML = `วันที่ ${day} <i class="fa-solid fa-sort"></i>`;
        
        // Add sorting trigger for days
        th.addEventListener('click', () => {
            const sortBy = `day-${day}`;
            if (currentSort.column === sortBy) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = sortBy;
                currentSort.direction = 'desc';
            }
            
            document.querySelectorAll('th.sortable i').forEach(icon => {
                icon.className = 'fa-solid fa-sort';
            });
            const icon = th.querySelector('i');
            icon.className = `fa-solid fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
            
            sortFilteredData();
            currentPage = 1;
            renderTable();
        });
        
        tableHeader.appendChild(th);
    }
}

// Populating filter options
function populateSiteFilter() {
    let eligibleData = inverterData;
    if (currentCategory !== 'all') {
        eligibleData = inverterData.filter(item => item.type === currentCategory);
    }
    const uniqueSites = [...new Set(eligibleData.map(item => item.site))].sort();
    
    // Keep 'All Sites' option
    filterSite.innerHTML = '<option value="all">ไซต์ทั้งหมด</option>';
    
    uniqueSites.forEach(site => {
        if (site.trim()) {
            const option = document.createElement('option');
            option.value = site;
            option.textContent = site;
            filterSite.appendChild(option);
        }
    });
}

function populateInverterFilter() {
    const selectedSite = filterSite.value;
    let eligibleData = inverterData;
    if (currentCategory !== 'all') {
        eligibleData = inverterData.filter(item => item.type === currentCategory);
    }
    
    let eligibleInverters = [];
    if (selectedSite === 'all') {
        eligibleInverters = eligibleData.map(item => item.device);
    } else {
        eligibleInverters = eligibleData
            .filter(item => item.site === selectedSite)
            .map(item => item.device);
    }
    
    const uniqueInverters = [...new Set(eligibleInverters)].sort();
    
    filterInverter.innerHTML = '<option value="all">อินเวอร์เตอร์ทั้งหมด</option>';
    uniqueInverters.forEach(dev => {
        if (dev.trim()) {
            const option = document.createElement('option');
            option.value = dev;
            option.textContent = dev;
            filterInverter.appendChild(option);
        }
    });
}

// Clear all filters
function clearFilters() {
    currentCategory = 'all';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-category="all"]').classList.add('active');

    filterSite.value = 'all';
    populateSiteFilter();
    populateInverterFilter();
    filterInverter.value = 'all';
    searchInput.value = '';
    applyFilters();
}

// Filtering and Search logic
function applyFilters() {
    const selectedSite = filterSite.value;
    const selectedInverter = filterInverter.value;
    const searchVal = searchInput.value.toLowerCase().trim();
    
    filteredData = inverterData.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.type === currentCategory;
        const matchesSite = selectedSite === 'all' || item.site === selectedSite;
        const matchesInverter = selectedInverter === 'all' || item.device === selectedInverter;
        const matchesSearch = !searchVal || 
            item.site.toLowerCase().includes(searchVal) || 
            item.device.toLowerCase().includes(searchVal) || 
            item.test.toLowerCase().includes(searchVal);
            
        return matchesCategory && matchesSite && matchesInverter && matchesSearch;
    });
    
    // Show/hide 'Clear Filters' button
    if (currentCategory !== 'all' || selectedSite !== 'all' || selectedInverter !== 'all' || searchVal !== '') {
        clearFiltersBtn.classList.remove('hidden');
    } else {
        clearFiltersBtn.classList.add('hidden');
    }
    
    // Group by site
    groupedData = groupDataBySite(filteredData);
    
    // Apply sorting, recalculate, and redraw
    sortFilteredData();
    currentPage = 1;
    
    updateKPIs();
    updateCharts();
    renderTable();
}

// Group filtered inverter data by site
function groupDataBySite(data) {
    const siteGroups = {};
    
    data.forEach(item => {
        const key = item.site;
        if (!siteGroups[key]) {
            siteGroups[key] = {
                site: item.site,
                inverterCount: 0,
                capacity: 0,
                daily: Array(31).fill(0),
                total: 0,
                type: item.type
            };
        }
        
        siteGroups[key].inverterCount += 1;
        if (item.capacity !== null) {
            siteGroups[key].capacity += item.capacity;
        }
        item.daily.forEach((val, idx) => {
            siteGroups[key].daily[idx] += val;
        });
        siteGroups[key].total += item.total;
    });
    
    return Object.values(siteGroups);
}

// Sorting logic
function sortFilteredData() {
    const col = currentSort.column;
    const dir = currentSort.direction === 'asc' ? 1 : -1;
    
    groupedData.sort((a, b) => {
        let valA, valB;
        
        if (col === 'site') {
            valA = a.site.toLowerCase();
            valB = b.site.toLowerCase();
        } else if (col === 'device') {
            valA = a.inverterCount;
            valB = b.inverterCount;
        } else if (col === 'capacity') {
            valA = a.capacity;
            valB = b.capacity;
        } else if (col === 'total') {
            valA = a.total;
            valB = b.total;
        } else if (col === 'target') {
            valA = (getSiteTarget(a.site) || { dailyTarget: 0 }).dailyTarget;
            valB = (getSiteTarget(b.site) || { dailyTarget: 0 }).dailyTarget;
        } else if (col === 'achievement') {
            const targetA = getSiteTarget(a.site);
            const activeDaysA = a.daily.filter(val => val > 0).length || 1;
            const targetValA = targetA ? targetA.dailyTarget * activeDaysA : 0;
            valA = targetValA > 0 ? (a.total / targetValA) * 100 : 0;
            
            const targetB = getSiteTarget(b.site);
            const activeDaysB = b.daily.filter(val => val > 0).length || 1;
            const targetValB = targetB ? targetB.dailyTarget * activeDaysB : 0;
            valB = targetValB > 0 ? (b.total / targetValB) * 100 : 0;
        } else if (col.startsWith('day-')) {
            const dayIdx = parseInt(col.split('-')[1]) - 1;
            valA = a.daily[dayIdx] || 0;
            valB = b.daily[dayIdx] || 0;
        }
        
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
}

// KPI Calculation
function updateKPIs() {
    if (filteredData.length === 0) {
        kpiTotalGen.textContent = '0';
        kpiActiveSites.textContent = '0';
        kpiTotalInverters.textContent = '0';
        kpiPeakDay.textContent = '0';
        kpiPeakDayLabel.textContent = 'วันที่ -';
        kpiDailyTargetPct.textContent = '-';
        kpiDailyTargetVal.textContent = 'เป้าหมาย: - kWh/วัน';
        kpiMonthlyTargetPct.textContent = '-';
        kpiMonthlyTargetVal.textContent = 'เป้าหมาย: - kWh/เดือน';
        return;
    }
    
    // Total Generation
    const totalSum = filteredData.reduce((sum, item) => sum + item.total, 0);
    kpiTotalGen.textContent = totalSum.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    
    // Active Sites
    const activeSitesCount = new Set(filteredData.map(item => item.site)).size;
    kpiActiveSites.textContent = activeSitesCount.toLocaleString();
    
    // Active Inverters
    kpiTotalInverters.textContent = filteredData.length.toLocaleString();
    
    // Peak Daily Generation Day
    const dailySums = Array(31).fill(0);
    filteredData.forEach(item => {
        item.daily.forEach((val, idx) => {
            dailySums[idx] += val;
        });
    });
    
    let maxGen = 0;
    let peakDayIdx = 0;
    dailySums.forEach((val, idx) => {
        if (val > maxGen) {
            maxGen = val;
            peakDayIdx = idx;
        }
    });
    
    kpiPeakDay.textContent = maxGen.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kWh';
    kpiPeakDayLabel.textContent = `วันที่ ${peakDayIdx + 1}`;

    // Calculate Targets and Achievements
    let totalDailyTarget = 0;
    let totalMonthlyTarget = 0;
    
    // Find unique sites in current selection
    const uniqueSites = [...new Set(filteredData.map(item => item.site))];
    
    uniqueSites.forEach(siteName => {
        const target = getSiteTarget(siteName);
        if (target) {
            totalDailyTarget += target.dailyTarget;
            totalMonthlyTarget += target.monthlyTarget;
        }
    });
    
    // How many days of data do we have?
    const activeDaysCount = dailySums.filter(val => val > 0).length || 1; // At least 1 to avoid division by zero
    
    // Daily target achievement
    if (totalDailyTarget > 0) {
        const averageActualDaily = totalSum / activeDaysCount;
        const dailyPct = (averageActualDaily / totalDailyTarget) * 100;
        kpiDailyTargetPct.textContent = dailyPct.toFixed(1) + '%';
        kpiDailyTargetVal.textContent = `เป้าหมาย: ${totalDailyTarget.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh/วัน`;
        
        kpiDailyTargetPct.style.color = dailyPct >= 100 ? '#00e676' : '#ffb300';
    } else {
        kpiDailyTargetPct.textContent = '-';
        kpiDailyTargetVal.textContent = 'เป้าหมาย: - kWh/วัน';
        kpiDailyTargetPct.style.color = '';
    }
    
    // Monthly target achievement
    if (totalMonthlyTarget > 0) {
        const monthlyPct = (totalSum / totalMonthlyTarget) * 100;
        kpiMonthlyTargetPct.textContent = monthlyPct.toFixed(1) + '%';
        kpiMonthlyTargetVal.textContent = `เป้าหมาย: ${totalMonthlyTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh/เดือน`;
        
        kpiMonthlyTargetPct.style.color = monthlyPct >= 100 ? '#00e676' : '#ffb300';
    } else {
        kpiMonthlyTargetPct.textContent = '-';
        kpiMonthlyTargetVal.textContent = 'เป้าหมาย: - kWh/เดือน';
        kpiMonthlyTargetPct.style.color = '';
    }
}

// Charts Generation & Update
function updateCharts() {
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#8b9bb4' : '#62728c';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    // Chart 1: Daily Generation Trend
    const dailySums = Array(31).fill(0);
    filteredData.forEach(item => {
        item.daily.forEach((val, idx) => {
            dailySums[idx] += val;
        });
    });
    
    const labels = Array.from({length: 31}, (_, i) => `วันที่ ${i + 1}`);
    
    if (dailyTrendChart) {
        dailyTrendChart.destroy();
    }
    
    const ctx1 = document.getElementById('daily-trend-chart').getContext('2d');
    
    // Create soft gradient for line chart area
    const gradient = ctx1.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, isDark ? 'rgba(0, 188, 212, 0.3)' : 'rgba(0, 112, 243, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 112, 243, 0.0)');
    
    dailyTrendChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'ปริมาณการผลิตไฟฟ้ารวม (kWh)',
                data: dailySums,
                borderColor: isDark ? '#00bcd4' : '#0070f3',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: isDark ? '#b388ff' : '#00e676',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    padding: 12,
                    cornerRadius: 8,
                    backgroundColor: isDark ? '#161e31' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1a2536',
                    bodyColor: isDark ? '#f0f4f9' : '#1a2536',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Inter' } }
                }
            }
        }
    });

    // Chart 2: Top Sites Distribution (Actual vs Target)
    const siteDataMap = {};
    filteredData.forEach(item => {
        siteDataMap[item.site] = (siteDataMap[item.site] || 0) + item.total;
    });
    
    const sortedSites = Object.entries(siteDataMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7); // Show top 7 sites
        
    const siteLabels = sortedSites.map(item => item[0]);
    const siteValues = sortedSites.map(item => parseFloat(item[1].toFixed(1)));
    
    // Calculate active days count for scaling targets
    const activeDaysCount = dailySums.filter(val => val > 0).length || 1;
    
    // Calculate targets for active days for each site
    const targetValues = siteLabels.map(site => {
        const target = getSiteTarget(site);
        if (target) {
            return parseFloat((target.dailyTarget * activeDaysCount).toFixed(1));
        }
        return 0;
    });
    
    if (siteDistributionChart) {
        siteDistributionChart.destroy();
    }
    
    const ctx2 = document.getElementById('site-distribution-chart').getContext('2d');
    
    siteDistributionChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: siteLabels.map(label => label.length > 18 ? label.slice(0, 15) + '...' : label),
            datasets: [
                {
                    label: 'ผลิตได้จริง (kWh)',
                    data: siteValues,
                    backgroundColor: isDark ? '#00bcd4' : '#0070f3',
                    borderRadius: 6,
                    barThickness: 10
                },
                {
                    label: 'เป้าหมายตามช่วงเวลา (kWh)',
                    data: targetValues,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
                    borderRadius: 6,
                    barThickness: 10
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: { color: textColor, font: { family: 'Prompt', size: 11 } }
                },
                tooltip: {
                    padding: 12,
                    cornerRadius: 8,
                    backgroundColor: isDark ? '#161e31' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1a2536',
                    bodyColor: isDark ? '#f0f4f9' : '#1a2536',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: textColor, font: { family: 'Inter' } }
                }
            }
        }
    });
    
    // Update target comparison chart
    updateTargetComparisonChart();
}

// Populating Site select inside target comparison card
function populateChartSiteSelect() {
    if (!chartSiteSelect) return;
    
    const uniqueSites = [...new Set(inverterData.map(item => item.site))].sort();
    
    // Save current selected value if any
    const curVal = chartSiteSelect.value;
    
    chartSiteSelect.innerHTML = '<option value="all">ทุกโครงการ (All Projects)</option>';
    
    uniqueSites.forEach(site => {
        if (site.trim()) {
            const option = document.createElement('option');
            option.value = site;
            option.textContent = site;
            chartSiteSelect.appendChild(option);
        }
    });
    
    if (curVal && [...chartSiteSelect.options].some(o => o.value === curVal)) {
        chartSiteSelect.value = curVal;
    } else {
        chartSiteSelect.value = 'all';
        chartSelectedSite = 'all';
    }
}

// Toggle Target Chart Period (Hourly, Daily, or Monthly)
window.setTargetChartPeriod = function(period) {
    chartPeriod = period;
    
    // Reset active states for all three buttons
    if (btnChartHourly) {
        btnChartHourly.classList.remove('btn-active');
        btnChartHourly.classList.add('btn-outline');
    }
    btnChartDaily.classList.remove('btn-active');
    btnChartDaily.classList.add('btn-outline');
    btnChartMonthly.classList.remove('btn-active');
    btnChartMonthly.classList.add('btn-outline');
    
    if (period === 'hourly') {
        if (btnChartHourly) {
            btnChartHourly.classList.add('btn-active');
            btnChartHourly.classList.remove('btn-outline');
        }
    } else if (period === 'daily') {
        btnChartDaily.classList.add('btn-active');
        btnChartDaily.classList.remove('btn-outline');
    } else {
        btnChartMonthly.classList.add('btn-active');
        btnChartMonthly.classList.remove('btn-outline');
    }
    updateTargetComparisonChart();
};

// Target Comparison Chart (Daily & Monthly)
function updateTargetComparisonChart() {
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#8b9bb4' : '#62728c';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    
    const chartCanvas = document.getElementById('target-comparison-chart');
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    
    if (targetComparisonChart) {
        targetComparisonChart.destroy();
    }
    
    // 1. Filter data based on selected site in chart selector
    let targetData = inverterData;
    if (chartSelectedSite !== 'all') {
        targetData = inverterData.filter(item => item.site === chartSelectedSite);
    }
    
    // 2. Sum up daily generation
    const dailyActuals = Array(31).fill(0);
    targetData.forEach(item => {
        item.daily.forEach((val, idx) => {
            dailyActuals[idx] += val;
        });
    });
    
    // 3. Find target
    let dailyTargetSum = 0;
    let monthlyTargetSum = 0;
    
    const uniqueSites = [...new Set(targetData.map(item => item.site))];
    uniqueSites.forEach(siteName => {
        const target = getSiteTarget(siteName);
        if (target) {
            dailyTargetSum += target.dailyTarget;
            monthlyTargetSum += target.monthlyTarget;
        }
    });
    
    if (chartPeriod === 'hourly') {
        // Find latest day with data
        let latestDayIndex = 0;
        for (let i = 30; i >= 0; i--) {
            if (dailyActuals[i] > 0) {
                latestDayIndex = i;
                break;
            }
        }
        const latestDayActualGen = dailyActuals[latestDayIndex];
        const dayNumber = latestDayIndex + 1;
        
        // Solar hourly distribution (Gaussian-like curve peaking at 12:00)
        const hourlyFactors = [
            0, 0, 0, 0, 0, 0,
            0.005, 0.02, 0.05, 0.08, 0.12, 0.14,
            0.16, 0.15, 0.12, 0.09, 0.06, 0.03,
            0.005, 0, 0, 0, 0, 0
        ];
        const sumFactors = hourlyFactors.reduce((a, b) => a + b, 0);
        const normalizedFactors = hourlyFactors.map(f => f / sumFactors);
        
        const hourlyActualValues = normalizedFactors.map(factor => latestDayActualGen * factor);
        const hourlyTargetValues = normalizedFactors.map(factor => dailyTargetSum * factor);
        
        const labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00 น.`);
        
        targetComparisonChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `เป้าหมายรายชั่วโมง (kWh) - อิงจากเป้าวัน`,
                        data: hourlyTargetValues,
                        borderColor: '#ff9800',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.4
                    },
                    {
                        label: `ผลผลิตจริงรายชั่วโมง (kWh) - อิงวันที่ ${dayNumber}`,
                        data: hourlyActualValues,
                        borderColor: isDark ? '#00bcd4' : '#0070f3',
                        backgroundColor: isDark ? 'rgba(0, 188, 212, 0.1)' : 'rgba(0, 112, 243, 0.1)',
                        borderWidth: 3,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: 'Prompt', size: 11 } }
                    },
                    tooltip: {
                        padding: 12,
                        cornerRadius: 8,
                        backgroundColor: isDark ? '#161e31' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#1a2536',
                        bodyColor: isDark ? '#f0f4f9' : '#1a2536',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += parseFloat(context.parsed.y).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' kWh';
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Prompt', size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Inter' } },
                        title: {
                            display: true,
                            text: 'พลังงานไฟฟ้า (kWh)',
                            color: textColor,
                            font: { family: 'Prompt', size: 11 }
                        }
                    }
                }
            }
        });
    } else if (chartPeriod === 'daily') {
        // Daily View: Mixed chart (Bars for actual, Line for target)
        const labels = Array.from({length: 31}, (_, i) => `วันที่ ${i + 1}`);
        const targetLineData = Array(31).fill(dailyTargetSum);
        
        targetComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'เป้าหมายรายวัน (kWh/วัน)',
                        data: targetLineData,
                        type: 'line',
                        borderColor: '#ff9800',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false,
                        yAxisID: 'y'
                    },
                    {
                        label: 'ผลผลิตจริงรายวัน (kWh)',
                        data: dailyActuals,
                        backgroundColor: isDark ? 'rgba(0, 188, 212, 0.65)' : 'rgba(0, 112, 243, 0.65)',
                        borderColor: isDark ? '#00bcd4' : '#0070f3',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: 'Prompt', size: 11 } }
                    },
                    tooltip: {
                        padding: 12,
                        cornerRadius: 8,
                        backgroundColor: isDark ? '#161e31' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#1a2536',
                        bodyColor: isDark ? '#f0f4f9' : '#1a2536',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Prompt', size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Inter' } },
                        title: {
                            display: true,
                            text: 'พลังงานไฟฟ้า (kWh)',
                            color: textColor,
                            font: { family: 'Prompt', size: 11 }
                        }
                    }
                }
            }
        });
    } else {
        // Monthly View: Compare total actual monthly so far vs monthly target
        const actualTotalMonthly = dailyActuals.reduce((sum, val) => sum + val, 0);
        
        targetComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['เปรียบเทียบเป้าหมายรายเดือน'],
                datasets: [
                    {
                        label: 'เป้าหมายรายเดือน (kWh)',
                        data: [monthlyTargetSum],
                        backgroundColor: '#ff9800',
                        borderColor: '#f57c00',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        maxBarThickness: 120
                    },
                    {
                        label: 'ผลผลิตสะสมจริง (kWh)',
                        data: [actualTotalMonthly],
                        backgroundColor: isDark ? 'rgba(0, 230, 118, 0.75)' : 'rgba(76, 175, 80, 0.75)',
                        borderColor: isDark ? '#00e676' : '#4caf50',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        maxBarThickness: 120
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: 'Prompt', size: 11 } }
                    },
                    tooltip: {
                        padding: 12,
                        cornerRadius: 8,
                        backgroundColor: isDark ? '#161e31' : '#ffffff',
                        titleColor: isDark ? '#ffffff' : '#1a2536',
                        bodyColor: isDark ? '#f0f4f9' : '#1a2536',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { family: 'Prompt', size: 12 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Inter' } },
                        title: {
                            display: true,
                            text: 'พลังงานไฟฟ้า (kWh)',
                            color: textColor,
                            font: { family: 'Prompt', size: 11 }
                        }
                    }
                }
            }
        });
    }
}

// Render Data Table
function renderTable() {
    tableBody.innerHTML = '';
    
    const totalCount = groupedData.length;
    tableCountBadge.textContent = `${totalCount} ไซต์`;
    totalRows.textContent = totalCount;
    
    if (totalCount === 0) {
        pageStart.textContent = '0';
        pageEnd.textContent = '0';
        tableBody.innerHTML = `<tr><td colspan="37" class="text-center" style="padding: 3rem; text-align: center; color: var(--text-muted);">ไม่พบข้อมูลที่ตรงกับตัวกรองที่ระบุ</td></tr>`;
        prevPage.disabled = true;
        nextPage.disabled = true;
        pageNumberDisplay.textContent = 'หน้า 1 จาก 1';
        return;
    }
    
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalCount);
    
    pageStart.textContent = startIdx + 1;
    pageEnd.textContent = endIdx;
    
    prevPage.disabled = currentPage === 1;
    nextPage.disabled = currentPage === totalPages;
    pageNumberDisplay.textContent = `หน้า ${currentPage} จาก ${totalPages}`;
    
    const showHeatmap = toggleHeatmap.checked;
    
    // Render Rows
    for (let i = startIdx; i < endIdx; i++) {
        const item = groupedData[i];
        const tr = document.createElement('tr');
        
        // Basic Info cells
        const siteCell = `<td>${item.site}</td>`;
        const inverterCountCell = `<td class="text-center">${item.inverterCount} เครื่อง</td>`;
        const capacityCell = `<td class="text-right">${item.capacity > 0 ? item.capacity.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'}</td>`;
        const totalCell = `<td class="text-right">${item.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>`;
        
        // Target and Achievement
        const siteTarget = getSiteTarget(item.site);
        let targetCell = `<td class="text-right">-</td>`;
        let achievementCell = `<td class="text-right">-</td>`;
        
        if (siteTarget) {
            targetCell = `<td class="text-right">${siteTarget.dailyTarget.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>`;
            
            const activeDaysCount = item.daily.filter(val => val > 0).length || 1;
            const targetForActiveDays = siteTarget.dailyTarget * activeDaysCount;
            if (targetForActiveDays > 0) {
                const pct = (item.total / targetForActiveDays) * 100;
                const color = pct >= 100 ? '#00e676' : '#ffb300';
                achievementCell = `<td class="text-right" style="color: ${color}; font-weight: 600;">${pct.toFixed(1)}%</td>`;
            }
        }
        
        tr.innerHTML = siteCell + inverterCountCell + capacityCell + totalCell + targetCell + achievementCell;
        
        // Add Day 1 to 31 Cells
        item.daily.forEach(val => {
            const td = document.createElement('td');
            td.className = 'text-right heat-cell';
            td.textContent = val > 0 ? val.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '';
            
            // Heatmap color injection
            if (showHeatmap && val > 0) {
                // Calculate scale ratio relative to global max daily value
                const alpha = Math.min(val / maxDailyValueGlobal, 1.0) * 0.55 + 0.05;
                // Emerald-green gradient color styling
                td.style.backgroundColor = `hsla(140, 80%, 45%, ${alpha})`;
                // Contrast text color for highly filled cells
                if (alpha > 0.4) {
                    td.style.color = '#000000';
                    td.style.fontWeight = '600';
                }
            }
            
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    }
}

// Export to CSV Function
function exportCSV() {
    if (groupedData.length === 0) return;
    
    // Create CSV Header
    let csvContent = 'ไซต์,จำนวนเครื่อง,กำลังการผลิตติดตั้งรวม (kW),รวมการผลิต (kWh),เป้าหมาย (kWh/วัน),% เทียบเป้า,';
    for (let d = 1; d <= 31; d++) {
        csvContent += `วันที่ ${d}${d === 31 ? '' : ','}`;
    }
    csvContent += '\r\n';
    
    // Create CSV Rows
    groupedData.forEach(item => {
        const siteTarget = getSiteTarget(item.site);
        const targetStr = siteTarget ? siteTarget.dailyTarget.toFixed(1) : '-';
        
        let achievementStr = '-';
        if (siteTarget) {
            const activeDaysCount = item.daily.filter(val => val > 0).length || 1;
            const targetForActiveDays = siteTarget.dailyTarget * activeDaysCount;
            if (targetForActiveDays > 0) {
                achievementStr = ((item.total / targetForActiveDays) * 100).toFixed(1) + '%';
            }
        }
        
        let row = `"${item.site.replace(/"/g, '""')}","${item.inverterCount} เครื่อง",${item.capacity || ''},${item.total},${targetStr},"${achievementStr}",`;
        row += item.daily.join(',');
        csvContent += row + '\r\n';
    });
    
    // Trigger file download
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // Add BOM for excel Thai compatibility
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงานการผลิตไฟฟ้าโซลาร์_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// TARGET DATABASE EDIT MODAL LOGIC
// ==========================================
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editSiteId = document.getElementById('edit-site-id');
const editSiteType = document.getElementById('edit-site-type');
const editSiteName = document.getElementById('edit-site-name');
const editSiteTypeDisplay = document.getElementById('edit-site-type-display');
const editSiteCapacity = document.getElementById('edit-site-capacity');
const editSiteDaily = document.getElementById('edit-site-daily');
const editSiteMonthly = document.getElementById('edit-site-monthly');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');

// Open Edit Modal
function openEditModal(id, type) {
    const item = allConfigTargets.find(t => t.id.toString() === id.toString() && t.type.toUpperCase() === type.toUpperCase());
    if (!item) return;
    
    editSiteId.value = item.id;
    editSiteType.value = item.type;
    editSiteName.value = item.siteName;
    editSiteTypeDisplay.value = item.type;
    editSiteCapacity.value = item.capacity;
    editSiteDaily.value = item.dailyTarget;
    editSiteMonthly.value = item.monthlyTarget;
    
    editModal.style.display = 'flex';
}

// Close Modal
function closeEditModal() {
    editModal.style.display = 'none';
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeEditModal);
if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeEditModal);

// Event delegation for Edit button in DB table
if (dbTableBody) {
    dbTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-edit');
        if (btn) {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            openEditModal(id, type);
        }
    });
}

// Handle form submit
if (editForm) {
    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            id: parseInt(editSiteId.value),
            type: editSiteType.value,
            capacity: parseFloat(editSiteCapacity.value),
            dailyTarget: parseFloat(editSiteDaily.value),
            monthlyTarget: parseFloat(editSiteMonthly.value)
        };
        
        showLoader(true);
        try {
            const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'http://localhost:8000';
            const response = await fetch(`${host}/api/save-config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            if (response.ok && result.success) {
                alert(result.message);
                closeEditModal();
                // Reload targets and dashboard data
                await loadDashboardData();
            } else {
                alert(result.message || 'บันทึกข้อมูลล้มเหลว!');
                showLoader(false);
            }
        } catch (error) {
            console.error('Error saving config:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: กรุณาตรวจสอบว่าเซิร์ฟเวอร์โลคอล (server.ps1) กำลังเปิดใช้งานอยู่!');
            showLoader(false);
        }
    });
}
