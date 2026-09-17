const fs = require('fs');

// We have the raw text of the capital register from the user
const rawText = `
Corpus Deposits,04/10/2023,04/10/2023,Cash Inflow 04.10.2023,"10,500,000.00",0.00,"10,500,000.00","10,500,000.00",0.00,"10,500,000.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AMARA RAJA ENERGY & MOBILITY LIMITED - 200,"136,300.00",0.00,"10,636,300.00","127,030.00",0.00,"10,627,030.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MODISON LTD - 2000,"183,800.00",0.00,"10,820,100.00","156,700.00",0.00,"10,783,730.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 37,"78,810.00",0.00,"10,898,910.00","76,423.50",0.00,"10,860,153.50"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 20,"127,800.00",0.00,"11,026,710.00","147,188.00",0.00,"11,007,341.50"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 11,"103,730.00",0.00,"11,130,440.00","80,953.40",0.00,"11,088,294.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA POWER CO LTD - 1780,"395,961.00",0.00,"11,526,401.00","451,942.00",0.00,"11,540,236.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 150,"283,750.00",0.00,"11,810,151.00","263,415.00",0.00,"11,803,651.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 100,"230,500.00",0.00,"12,040,651.00","245,010.00",0.00,"12,048,661.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 99,"236,808.00",0.00,"12,277,459.00","242,559.90",0.00,"12,291,221.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 31,"75,405.95",0.00,"12,352,864.95","75,953.10",0.00,"12,367,174.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 40,"300,800.00",0.00,"12,653,664.95","323,344.00",0.00,"12,690,518.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 10,"72,828.50",0.00,"12,726,493.45","80,836.00",0.00,"12,771,354.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 10,"74,200.00",0.00,"12,800,693.45","80,836.00",0.00,"12,852,190.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AAVAS FINANCIERS LTD - 60,"110,100.00",0.00,"12,910,793.45","103,611.00",0.00,"12,955,801.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AAVAS FINANCIERS LTD - 100,"142,000.00",0.00,"13,052,793.45","172,685.00",0.00,"13,128,486.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SBI CARDS AND PAYMENT SERVICES LTD - 100,"108,665.00",0.00,"13,161,458.45","79,140.00",0.00,"13,207,626.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MAZAGON DOCK SHIPBUILDERS LTD - 100,"186,000.00",0.00,"13,347,458.45","216,755.00",0.00,"13,424,381.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MAZAGON DOCK SHIPBUILDERS LTD - 31,"56,265.00",0.00,"13,403,723.45","67,194.05",0.00,"13,491,575.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 100,"144,700.00",0.00,"13,548,423.45","152,485.00",0.00,"13,644,060.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   RELAXO FOOTWEARS LTD - 44,"58,520.00",0.00,"13,606,943.45","39,756.20",0.00,"13,683,817.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   UNO MINDA LTD - 1000,"619,425.00",0.00,"14,226,368.45","596,350.00",0.00,"14,280,167.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BRIGHTCOM GROUP LTD - 10000,"251,300.00",0.00,"14,477,668.45","169,000.00",0.00,"14,449,167.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA MOTORS PASSENGER VEHICLES LTD TYPE A SHARES - 339,"87,462.00",0.00,"14,565,130.45","141,617.25",0.00,"14,590,784.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   OLECTRA GREENTECH LTD - 370,"442,747.80",0.00,"15,007,878.25","434,639.00",0.00,"15,025,423.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 50,"178,250.00",0.00,"15,186,128.25","239,180.00",0.00,"15,264,603.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 26,"119,184.00",0.00,"15,305,312.25","124,373.60",0.00,"15,388,977.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 500,"137,500.00",0.00,"15,442,812.25","122,625.00",0.00,"15,511,602.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BALAJI AMINES LTD - 150,"362,000.00",0.00,"15,804,812.25","331,747.50",0.00,"15,843,349.50"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BERGER PAINTS INDIA LTD - 72,"50,040.00",0.00,"15,854,852.25","40,449.60",0.00,"15,883,799.10"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MODISON LTD - 3000,"246,000.00",0.00,"16,100,852.25","235,050.00",0.00,"16,118,849.10"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   GARWARE TECHNICAL FIBRES LTD - 4,"13,799.70",0.00,"16,114,651.95","12,606.60",0.00,"16,131,455.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AARTI INDUSTRIES LTD - 200,"193,400.00",0.00,"16,308,051.95","95,310.00",0.00,"16,226,765.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SAMVARDHANA MOTHERSON INTERNATIONAL LTD - 2000,"172,000.00",0.00,"16,480,051.95","186,600.00",0.00,"16,413,365.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 100,"226,100.00",0.00,"16,706,151.95","245,010.00",0.00,"16,658,375.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 20,"119,200.00",0.00,"16,825,351.95","161,672.00",0.00,"16,820,047.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN ENERGY EXCHANGE LTD - 4000,"569,600.00",0.00,"17,394,951.95","536,000.00",0.00,"17,356,047.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC LIFE INSURANCE COMPANY LTD - 450,"247,500.00",0.00,"17,642,451.95","279,562.50",0.00,"17,635,610.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AAVAS FINANCIERS LTD - 50,"126,500.00",0.00,"17,768,951.95","86,342.50",0.00,"17,721,952.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AAVAS FINANCIERS LTD - 70,"102,410.00",0.00,"17,871,361.95","120,879.50",0.00,"17,842,832.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MAZAGON DOCK SHIPBUILDERS LTD - 50,"93,500.00",0.00,"17,964,861.95","108,377.50",0.00,"17,951,209.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 100,"157,295.00",0.00,"18,122,156.95","152,485.00",0.00,"18,103,694.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   APL APOLLO TUBES LTD - 100,"116,885.70",0.00,"18,239,042.65","161,490.00",0.00,"18,265,184.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SHEELA FOAM LTD - 510,"620,290.00",0.00,"18,859,332.65","548,250.00",0.00,"18,813,434.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   JUBILANT FOODWORKS LTD - 200,"103,600.00",0.00,"18,962,932.65","106,070.00",0.00,"18,919,504.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   IDFC FIRST BANK LTD - 1150,"57,672.50",0.00,"19,020,605.15","103,787.50",0.00,"19,023,292.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA CONSULTANCY SERVICES LTD - 50,"169,500.00",0.00,"19,190,105.15","181,445.00",0.00,"19,204,737.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA CONSULTANCY SERVICES LTD - 50,"169,000.00",0.00,"19,359,105.15","181,445.00",0.00,"19,386,182.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CANARA BANK - 325,"101,400.00",0.00,"19,460,505.15","121,062.50",0.00,"19,507,244.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MUTHOOT FINANCE LTD - 155,"199,950.00",0.00,"19,660,455.15","188,797.75",0.00,"19,696,042.45"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DELTA CORP LTD - 140,"36,806.00",0.00,"19,697,261.15","19,908.00",0.00,"19,715,950.45"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ALKYL AMINES CHEMICALS LTD - 40,"131,080.00",0.00,"19,828,341.15","91,366.00",0.00,"19,807,316.45"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 78,"240,240.00",0.00,"20,068,581.15","245,817.00",0.00,"20,053,133.45"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 32,"199,040.00",0.00,"20,267,621.15","235,500.80",0.00,"20,288,634.25"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 40,"97,200.00",0.00,"20,364,821.15","98,004.00",0.00,"20,386,638.25"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 40,"104,400.00",0.00,"20,469,221.15","98,004.00",0.00,"20,484,642.25"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 13,"102,089.00",0.00,"20,571,310.15","105,086.80",0.00,"20,589,729.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 16,"105,600.00",0.00,"20,676,910.15","129,337.60",0.00,"20,719,066.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC LIFE INSURANCE COMPANY LTD - 200,"118,000.00",0.00,"20,794,910.15","124,250.00",0.00,"20,843,316.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MTAR TECHNOLOGIES LTD - 100,"222,000.00",0.00,"21,016,910.15","255,870.00",0.00,"21,099,186.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AFFLE 3I LTD - 100,"109,500.00",0.00,"21,126,410.15","105,725.00",0.00,"21,204,911.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD - 125,"104,375.00",0.00,"21,230,785.15","88,212.50",0.00,"21,293,124.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 600,"114,900.00",0.00,"21,345,685.15","128,580.00",0.00,"21,421,704.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PAGE INDUSTRIES LTD - 1,"48,465.00",0.00,"21,394,150.15","39,334.75",0.00,"21,461,038.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 500,"83,844.05",0.00,"21,477,994.20","122,625.00",0.00,"21,583,663.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BERGER PAINTS INDIA LTD - 165,"100,650.00",0.00,"21,578,644.20","92,697.00",0.00,"21,676,360.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AEGIS LOGISTICS LTD - 790,"292,063.00",0.00,"21,870,707.20","255,565.00",0.00,"21,931,925.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 45,"103,500.00",0.00,"21,974,207.20","92,947.50",0.00,"22,024,873.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SRF LTD - 100,"216,000.00",0.00,"22,190,207.20","223,035.00",0.00,"22,247,908.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 55,"105,875.00",0.00,"22,296,082.20","96,585.50",0.00,"22,344,493.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 10,"74,622.00",0.00,"22,370,704.20","80,836.00",0.00,"22,425,329.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 30,"178,500.00",0.00,"22,549,204.20","242,508.00",0.00,"22,667,837.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MTAR TECHNOLOGIES LTD - 43,"92,450.00",0.00,"22,641,654.20","110,024.10",0.00,"22,777,862.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MTAR TECHNOLOGIES LTD - 74,"199,430.00",0.00,"22,841,084.20","189,343.80",0.00,"22,967,205.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SBI CARDS AND PAYMENT SERVICES LTD - 125,"101,044.60",0.00,"22,942,128.80","98,925.00",0.00,"23,066,130.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MAZAGON DOCK SHIPBUILDERS LTD - 100,"175,000.00",0.00,"23,117,128.80","216,755.00",0.00,"23,282,885.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SEPC LTD - 19500,"285,675.00",0.00,"23,402,803.80","324,675.00",0.00,"23,607,560.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   APL APOLLO TUBES LTD - 262,"356,700.00",0.00,"23,759,503.80","423,103.80",0.00,"24,030,664.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CCL PRODUCTS INDIA LTD - 500,"323,700.00",0.00,"24,083,203.80","329,025.00",0.00,"24,359,689.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 870,"147,030.00",0.00,"24,230,233.80","186,441.00",0.00,"24,546,130.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 1128,"177,096.00",0.00,"24,407,329.80","241,730.40",0.00,"24,787,861.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   IDBI BANK LTD - 5000,"352,500.00",0.00,"24,759,829.80","339,250.00",0.00,"25,127,111.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LIC HOUSING FINANCE LTD - 1000,"415,000.00",0.00,"25,174,829.80","469,350.00",0.00,"25,596,461.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MIRZA INTERNATIONAL LTD - 400,"117,000.00",0.00,"25,291,829.80","19,380.00",0.00,"25,615,841.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CL EDUCATE LTD - 2000,"150,000.00",0.00,"25,441,829.80","138,500.00",0.00,"25,754,341.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 25,"101,250.00",0.00,"25,543,079.80","119,590.00",0.00,"25,873,931.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 1000,"162,500.00",0.00,"25,705,579.80","245,250.00",0.00,"26,119,181.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA CONSULTANCY SERVICES LTD - 50,"169,250.00",0.00,"25,874,829.80","181,445.00",0.00,"26,300,626.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CANARA BANK - 603,"194,145.00",0.00,"26,068,974.80","224,617.50",0.00,"26,525,243.50"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MUTHOOT FINANCE LTD - 61,"101,260.00",0.00,"26,170,234.80","74,301.05",0.00,"26,599,544.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 60,"199,140.00",0.00,"26,369,374.80","189,090.00",0.00,"26,788,634.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 14,"49,000.00",0.00,"26,418,374.80","44,121.00",0.00,"26,832,755.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 45,"101,250.00",0.00,"26,519,624.80","92,947.50",0.00,"26,925,703.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA MOTORS PASSENGER VEHICLES LTD - 200,"100,930.00",0.00,"26,620,554.80","126,110.00",0.00,"27,051,813.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 60,"104,400.00",0.00,"26,724,954.80","105,366.00",0.00,"27,157,179.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 40,"77,200.00",0.00,"26,802,154.80","70,244.00",0.00,"27,227,423.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 26,"63,674.00",0.00,"26,865,828.80","63,702.60",0.00,"27,291,125.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN ENERGY EXCHANGE LTD - 750,"105,975.00",0.00,"26,971,803.80","100,500.00",0.00,"27,391,625.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC LIFE INSURANCE COMPANY LTD - 74,"49,580.00",0.00,"27,021,383.80","45,972.50",0.00,"27,437,598.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD - 300,"249,420.00",0.00,"27,270,803.80","211,710.00",0.00,"27,649,308.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD - 148,"99,900.00",0.00,"27,370,703.80","104,443.60",0.00,"27,753,751.75"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BRIGHTCOM GROUP LTD - 10000,"250,000.00",0.00,"27,620,703.80","169,000.00",0.00,"27,922,751.75"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   OLECTRA GREENTECH LTD - 958,"1,045,800.00",0.00,"28,666,503.80","1,125,362.60",0.00,"29,048,114.35"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 40,"151,200.00",0.00,"28,817,703.80","191,344.00",0.00,"29,239,458.35"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   IDFC FIRST BANK LTD - 3000,"142,500.00",0.00,"28,960,203.80","270,750.00",0.00,"29,510,208.35"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 26,"88,660.00",0.00,"29,048,863.80","96,554.90",0.00,"29,606,763.25"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MUTHOOT FINANCE LTD - 95,"102,117.60",0.00,"29,150,981.40","115,714.75",0.00,"29,722,478.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DELTA CORP LTD - 1000,"180,000.00",0.00,"29,330,981.40","142,200.00",0.00,"29,864,678.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ALKYL AMINES CHEMICALS LTD - 53,"225,144.00",0.00,"29,556,125.40","121,059.95",0.00,"29,985,737.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AMARA RAJA ENERGY & MOBILITY LIMITED - 100,"65,000.00",0.00,"29,621,125.40","63,515.00",0.00,"30,049,252.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 50,"143,000.00",0.00,"29,764,125.40","157,575.00",0.00,"30,206,827.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 50,"102,100.00",0.00,"29,866,225.40","103,275.00",0.00,"30,310,102.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   GARWARE TECHNICAL FIBRES LTD - 60,"198,000.00",0.00,"30,064,225.40","189,099.00",0.00,"30,499,201.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HFCL LTD - 3425,"242,550.00",0.00,"30,306,775.40","250,196.25",0.00,"30,749,398.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 15,"105,450.00",0.00,"30,412,225.40","110,391.00",0.00,"30,859,789.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TITAN COMPANY LTD - 35,"104,650.00",0.00,"30,516,875.40","114,422.00",0.00,"30,974,211.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   WIPRO LTD - 1000,"442,521.15",0.00,"30,959,396.55","407,750.00",0.00,"31,381,961.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   FEDERAL BANK LTD - 7900,"1,019,100.00",0.00,"31,978,496.55","1,168,805.00",0.00,"32,550,766.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 20,"133,400.00",0.00,"32,111,896.55","161,672.00",0.00,"32,712,438.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN ENERGY EXCHANGE LTD - 500,"112,500.00",0.00,"32,224,396.55","67,000.00",0.00,"32,779,438.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC LIFE INSURANCE COMPANY LTD - 200,"127,200.00",0.00,"32,351,596.55","124,250.00",0.00,"32,903,688.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   IIFL CAPITAL SERVICES LTD - 1100,"107,085.00",0.00,"32,458,681.55","98,780.00",0.00,"33,002,468.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD - 200,"123,000.00",0.00,"32,581,681.55","141,140.00",0.00,"33,143,608.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 100,"142,870.00",0.00,"32,724,551.55","152,485.00",0.00,"33,296,093.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 1190,"234,955.15",0.00,"32,959,506.70","255,017.00",0.00,"33,551,110.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CENTRAL DEPOSITORY SERVICES INDIA LTD - 92,"122,820.00",0.00,"33,082,326.70","121,660.80",0.00,"33,672,771.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 500,"86,000.00",0.00,"33,168,326.70","122,625.00",0.00,"33,795,396.00"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LUX INDUSTRIES LTD - 91,"157,430.00",0.00,"33,325,756.70","125,766.55",0.00,"33,921,162.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 39,"132,002.40",0.00,"33,457,759.10","144,832.35",0.00,"34,065,994.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BALAJI AMINES LTD - 50,"107,500.00",0.00,"33,565,259.10","110,582.50",0.00,"34,176,577.40"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ALKYL AMINES CHEMICALS LTD - 71,"215,470.00",0.00,"33,780,729.10","162,174.65",0.00,"34,338,752.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 39,"122,616.00",0.00,"33,903,345.10","122,908.50",0.00,"34,461,660.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 50,"151,500.00",0.00,"34,054,845.10","157,575.00",0.00,"34,619,235.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 100,"229,492.40",0.00,"34,284,337.50","206,550.00",0.00,"34,825,785.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HFCL LTD - 2400,"196,800.00",0.00,"34,481,137.50","175,320.00",0.00,"35,001,105.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HFCL LTD - 2000,"154,000.00",0.00,"34,635,137.50","146,100.00",0.00,"35,147,205.55"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 34,"205,190.00",0.00,"34,840,327.50","250,219.60",0.00,"35,397,425.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 100,"174,669.00",0.00,"35,014,996.50","175,610.00",0.00,"35,573,035.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   PIDILITE INDUSTRIES LTD - 107,"272,850.00",0.00,"35,287,846.50","262,160.70",0.00,"35,835,195.85"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 23,"165,789.75",0.00,"35,453,636.25","185,922.80",0.00,"36,021,118.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 15,"112,641.75",0.00,"35,566,278.00","121,254.00",0.00,"36,142,372.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN RAILWAY CATERING and TOURISM CORPORATION LTD - 710,"499,840.00",0.00,"36,066,118.00","501,047.00",0.00,"36,643,419.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 153,"235,620.00",0.00,"36,301,738.00","233,302.05",0.00,"36,876,721.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 70,"107,100.00",0.00,"36,408,838.00","106,739.50",0.00,"36,983,461.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 66,"100,980.00",0.00,"36,509,818.00","100,640.10",0.00,"37,084,101.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   APL APOLLO TUBES LTD - 150,"151,500.00",0.00,"36,661,318.00","242,235.00",0.00,"37,326,336.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   APL APOLLO TUBES LTD - 80,"116,800.00",0.00,"36,778,118.00","129,192.00",0.00,"37,455,528.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   RELAXO FOOTWEARS LTD - 150,"150,447.50",0.00,"36,928,565.50","135,532.50",0.00,"37,591,060.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 2100,"354,900.00",0.00,"37,283,465.50","450,030.00",0.00,"38,041,090.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BANK OF BARODA - 2420,"365,783.00",0.00,"37,649,248.50","518,606.00",0.00,"38,559,696.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   CENTRAL DEPOSITORY SERVICES INDIA LTD - 70,"105,700.00",0.00,"37,754,948.50","92,568.00",0.00,"38,652,264.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LIC HOUSING FINANCE LTD - 1150,"494,500.00",0.00,"38,249,448.50","539,752.50",0.00,"39,192,017.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 45,"229,025.00",0.00,"38,478,473.50","215,262.00",0.00,"39,407,279.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   LnT TECHNOLOGY SERVICES LTD - 73,"268,598.20",0.00,"38,747,071.70","349,202.80",0.00,"39,756,482.10"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 1000,"204,000.00",0.00,"38,951,071.70","245,250.00",0.00,"40,001,732.10"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BLS INTERNATIONAL SERVICES LTD - 750,"206,250.00",0.00,"39,157,321.70","183,937.50",0.00,"40,185,669.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AMRUTANJAN HEALTH CARE LTD - 27,"22,104.90",0.00,"39,179,426.60","16,275.60",0.00,"40,201,945.20"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 30,"98,100.00",0.00,"39,277,526.60","111,409.50",0.00,"40,313,354.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 100,"288,000.00",0.00,"39,565,526.60","371,365.00",0.00,"40,684,719.70"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 6,"22,482.00",0.00,"39,588,008.60","22,281.90",0.00,"40,707,001.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DELTA CORP LTD - 400,"91,000.00",0.00,"39,679,008.60","56,880.00",0.00,"40,763,881.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BERGER PAINTS INDIA LTD - 200,"156,200.00",0.00,"39,835,208.60","112,360.00",0.00,"40,876,241.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BERGER PAINTS INDIA LTD - 200,"128,000.00",0.00,"39,963,208.60","112,360.00",0.00,"40,988,601.60"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   AMARA RAJA ENERGY & MOBILITY LIMITED - 327,"221,706.00",0.00,"40,184,914.60","207,694.05",0.00,"41,196,295.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 63,"200,273.25",0.00,"40,385,187.85","198,544.50",0.00,"41,394,840.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 30,"92,970.00",0.00,"40,478,157.85","94,545.00",0.00,"41,489,385.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   ASIAN PAINTS LTD - 66,"200,640.00",0.00,"40,678,797.85","207,999.00",0.00,"41,697,384.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DEEPAK NITRITE LTD - 50,"104,500.00",0.00,"40,783,297.85","103,275.00",0.00,"41,800,659.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HFCL LTD - 1200,"100,800.00",0.00,"40,884,097.85","87,660.00",0.00,"41,888,319.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA ELXSI LTD - 20,"126,000.00",0.00,"41,010,097.85","147,188.00",0.00,"42,035,507.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA MOTORS PASSENGER VEHICLES LTD - 200,"102,000.00",0.00,"41,112,097.85","126,110.00",0.00,"42,161,617.15"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TITAN COMPANY LTD - 84,"256,200.00",0.00,"41,368,297.85","274,612.80",0.00,"42,436,229.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   KOTAK MAHINDRA BANK LTD - 100,"193,000.00",0.00,"41,561,297.85","175,610.00",0.00,"42,611,839.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   BAJAJ FINANCE LTD - 15,"103,755.00",0.00,"41,665,052.85","121,254.00",0.00,"42,733,093.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   INDIAN ENERGY EXCHANGE LTD - 400,"100,200.00",0.00,"41,765,252.85","53,600.00",0.00,"42,786,693.95"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC LIFE INSURANCE COMPANY LTD - 170,"102,595.00",0.00,"41,867,847.85","105,612.50",0.00,"42,892,306.45"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SBI CARDS AND PAYMENT SERVICES LTD - 104,"99,840.00",0.00,"41,967,687.85","82,305.60",0.00,"42,974,612.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   SBI CARDS AND PAYMENT SERVICES LTD - 115,"101,775.00",0.00,"42,069,462.85","91,011.00",0.00,"43,065,623.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MAZAGON DOCK SHIPBUILDERS LTD - 300,"567,000.00",0.00,"42,636,462.85","650,265.00",0.00,"43,715,888.05"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 95,"145,065.00",0.00,"42,781,527.85","144,860.75",0.00,"43,860,748.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 70,"102,900.00",0.00,"42,884,427.85","106,739.50",0.00,"43,967,488.30"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 70,"103,600.00",0.00,"42,988,027.85","106,739.50",0.00,"44,074,227.80"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   APL APOLLO TUBES LTD - 59,"102,070.00",0.00,"43,090,097.85","95,279.10",0.00,"44,169,506.90"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   RELAXO FOOTWEARS LTD - 199,"230,442.00",0.00,"43,320,539.85","179,806.45",0.00,"44,349,313.35"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   TATA MOTORS PASSENGER VEHICLES LTD TYPE A SHARES - 250,"100,000.00",0.00,"43,420,539.85","104,437.50",0.00,"44,453,750.85"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   MIRZA INTERNATIONAL LTD - 202,"55,752.00",0.00,"43,476,291.85","9,786.90",0.00,"44,463,537.75"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   IDFC FIRST BANK LTD - 2100,"100,275.00",0.00,"43,576,566.85","189,525.00",0.00,"44,653,062.75"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 26,"101,634.00",0.00,"43,678,200.85","96,554.90",0.00,"44,749,617.65"
Security in,11/10/2023,11/10/2023,Stock Transfer  Vijaya Sharma   DIVIS LABORATORIES LTD - 30,"106,438.80",0.00,"43,784,639.65","111,409.50",0.00,"44,861,027.15"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   EKI ENERGY SERVICES LTD - 153,"216,036.00",0.00,"44,000,675.65","68,406.30",0.00,"44,929,433.45"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   VINSYS IT SERVICES INDIA LTD - 1000,"240,000.00",0.00,"44,240,675.65","264,900.00",0.00,"45,194,333.45"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   IDFC FIRST BANK LTD - 3200,"300,795.03",0.00,"44,541,470.68","290,560.00",0.00,"45,484,893.45"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   EKI ENERGY SERVICES LTD - 72,"100,080.00",0.00,"44,641,550.68","32,191.20",0.00,"45,517,084.65"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   EKI ENERGY SERVICES LTD - 500,"220,000.00",0.00,"44,861,550.68","223,550.00",0.00,"45,740,634.65"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   HDFC BANK LTD - 599,"895,379.21",0.00,"45,756,929.89","928,360.15",0.00,"46,668,994.80"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   HINDUSTAN AERONAUTICS LTD - 53,"100,170.00",0.00,"45,857,099.89","104,327.85",0.00,"46,773,322.65"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   HINDUSTAN AERONAUTICS LTD - 37,0.00,0.00,"45,857,099.89","72,832.65",0.00,"46,846,155.30"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   EKI ENERGY SERVICES LTD - 59,"27,140.00",0.00,"45,884,239.89","26,378.90",0.00,"46,872,534.20"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   VINSYS IT SERVICES INDIA LTD - 1000,"265,000.00",0.00,"46,149,239.89","264,900.00",0.00,"47,137,434.20"
Security in,13/10/2023,13/10/2023,Stock Transfer  Vijaya Sharma   UNO MINDA LTD - 500,"300,000.00",0.00,"46,449,239.89","299,375.00",0.00,"47,436,809.20"
`;

function parseRegister() {
  const lines = rawText.trim().split('\n');
  const scripMap = {};

  lines.forEach(line => {
    if (!line.startsWith('Security in')) return;
    
    // Parse CSV line handling quotes
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index === regex.lastIndex) regex.lastIndex++;
      let val = match[1];
      if (val) {
        val = val.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
      }
      matches.push(val);
      if (matches.length > 15) break;
    }
    
    const desc = matches[3] || '';
    // Format: Stock Transfer  Vijaya Sharma   SCRIP NAME - QTY
    const m = desc.match(/Stock Transfer\s+Vijaya Sharma\s+(.+)\s+-\s+(\d+)/i);
    if (!m) return;
    
    const scripName = m[1].trim();
    const qty = parseInt(m[2], 10);
    const costCredit = parseFloat((matches[4] || '0').replace(/,/g, ''));
    const mktCredit = parseFloat((matches[7] || '0').replace(/,/g, ''));

    if (!scripMap[scripName]) {
      scripMap[scripName] = { qty: 0, costTotal: 0, mktTotal: 0, tranches: 0 };
    }
    scripMap[scripName].qty += qty;
    scripMap[scripName].costTotal += costCredit;
    scripMap[scripName].mktTotal += mktCredit;
    scripMap[scripName].tranches++;
  });

  console.log("=== IN-KIND SECURITIES SUMMARY: COST VS MARKET PRICE ===\n");
  console.log("SCRIP NAME".padEnd(45) + "QTY".padStart(8) + "COST BASIS".padStart(15) + "MKT BASIS".padStart(15) + "COST/SH".padStart(12) + "MKT/SH".padStart(12) + "DIFF(₹)".padStart(14));
  console.log("-".repeat(121));

  let totQty = 0, totCost = 0, totMkt = 0;

  Object.keys(scripMap).sort().forEach(name => {
    const d = scripMap[name];
    const costPerSh = d.costTotal / d.qty;
    const mktPerSh = d.mktTotal / d.qty;
    const diff = d.mktTotal - d.costTotal;

    totQty += d.qty;
    totCost += d.costTotal;
    totMkt += d.mktTotal;

    console.log(
      name.padEnd(45) +
      String(d.qty).padStart(8) +
      ("₹" + Math.round(d.costTotal).toLocaleString('en-IN')).padStart(15) +
      ("₹" + Math.round(d.mktTotal).toLocaleString('en-IN')).padStart(15) +
      ("₹" + costPerSh.toFixed(2)).padStart(12) +
      ("₹" + mktPerSh.toFixed(2)).padStart(12) +
      ((diff >= 0 ? "+₹" : "-₹") + Math.abs(Math.round(diff)).toLocaleString('en-IN')).padStart(14)
    );
  });

  console.log("-".repeat(121));
  console.log(
    "TOTAL IN-KIND SECURITIES".padEnd(45) +
    String(totQty).padStart(8) +
    ("₹" + Math.round(totCost).toLocaleString('en-IN')).padStart(15) +
    ("₹" + Math.round(totMkt).toLocaleString('en-IN')).padStart(15) +
    "".padStart(12) +
    "".padStart(12) +
    ("+₹" + Math.round(totMkt - totCost).toLocaleString('en-IN')).padStart(14)
  );
}

parseRegister();
