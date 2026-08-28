-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" TEXT NOT NULL DEFAULT 'AZMA',
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
    "aiPrompt" TEXT NOT NULL DEFAULT 'أنت Tez، مساعد الذكاء الاصطناعي الخاص بمتجر AZMA.',
    "aiApiKey" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL DEFAULT '',
    "images" TEXT NOT NULL DEFAULT '[]',
    "types" TEXT NOT NULL DEFAULT '[]',
    "sizes" TEXT NOT NULL DEFAULT '[]',
    "badge" TEXT NOT NULL DEFAULT '',
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "productPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "size" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "picture" TEXT NOT NULL DEFAULT '',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "waEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waPhoneId" TEXT NOT NULL DEFAULT '',
    "waToken" TEXT NOT NULL DEFAULT '',
    "waTemplate" TEXT NOT NULL DEFAULT '',
    "waReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "igEnabled" BOOLEAN NOT NULL DEFAULT false,
    "igUserId" TEXT NOT NULL DEFAULT '',
    "igToken" TEXT NOT NULL DEFAULT '',
    "igCommentReply" BOOLEAN NOT NULL DEFAULT true,
    "igDmReply" BOOLEAN NOT NULL DEFAULT true,
    "webhookSecret" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "history" TEXT NOT NULL DEFAULT '[]',
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
