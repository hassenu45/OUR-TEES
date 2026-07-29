-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "siteName" TEXT NOT NULL DEFAULT 'OUR TEES',
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "currencySymbol" TEXT NOT NULL DEFAULT 'ر.س',
    "adminPassword" TEXT NOT NULL DEFAULT 'admin123',
    "googleClientId" TEXT NOT NULL DEFAULT '',
    "sizes" TEXT NOT NULL DEFAULT 'S,M,L,XL,XXL',
    "types" TEXT NOT NULL DEFAULT 'قطن كلاسيك,فينتاج,بريميوم,oversized',
    "heroBadge" TEXT NOT NULL DEFAULT 'NEW DROP',
    "heroDrop" TEXT NOT NULL DEFAULT 'DROP 01 — SPRING 2026',
    "heroTitle" TEXT NOT NULL DEFAULT 'WEAR YOUR ATTITUDE.',
    "heroSubtitle" TEXT NOT NULL DEFAULT 'Premium tees for those who refuse to blend in.',
    "aboutTitle" TEXT NOT NULL DEFAULT 'BUILT DIFFERENT.',
    "aboutText" TEXT NOT NULL DEFAULT 'Started in a garage with one screen printer.',
    "aiName" TEXT NOT NULL DEFAULT 'Tez',
    "aiWelcome" TEXT NOT NULL DEFAULT 'أهلاً بك! أنا Tez، المساعد الذكي.',
    "aiPrompt" TEXT NOT NULL DEFAULT 'أنت Tez، مساعد الذكاء الاصطناعي الخاص بمتجر Our Tees.',
    "aiApiKey" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL DEFAULT '',
    "images" TEXT NOT NULL DEFAULT '[]',
    "types" TEXT NOT NULL DEFAULT '[]',
    "sizes" TEXT NOT NULL DEFAULT '[]',
    "badge" TEXT NOT NULL DEFAULT '',
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "productPrice" REAL NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "price" REAL NOT NULL,
    "size" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT NOT NULL DEFAULT '',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
