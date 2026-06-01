# RNP Analitika Dashboard

## Tuzilma

```
rnp/
├── frontend/     React + Vite SPA
├── backend/      Express REST API
├── automation/   Python ETL (CRM + Production)
├── database/     SQL schema + migrations
└── dashboard.html  Prototip (original)
```

## Ishga tushirish

### 1. Database

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p rnp_analytics < database/seed.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # DB va JWT ma'lumotlarini to'ldiring
npm run dev                  # port 5000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm run dev                  # port 3000
```

### 4. Python ETL

```bash
cd automation
pip install -r requirements.txt
cp ../.env.example ../.env  # DB credentials
python scheduler/cron_jobs.py --job=all
```

---

## Ahost Deploy

### Frontend
```bash
cd frontend && npm run build
# dist/ papkasini public_html/ ga yuklang
```

### Backend (cPanel Node.js App)
```
Application root: /home/username/rnp/backend
Application URL:  yourdomain.com/api
Application startup file: src/server.js
```

### Manual ETL trigger (admin panel)
`POST /api/sync` — admin foydalanuvchi tomonidan veb-interfeys orqali

---

## API Endpointlar

| Method | Endpoint                    | Tavsif                  |
|--------|-----------------------------|-------------------------|
| POST   | /api/auth/login             | JWT token olish         |
| GET    | /api/production/kpi         | Ishlab chiqarish KPI    |
| GET    | /api/production/departments | Bo'limlar holati        |
| GET    | /api/crm/monthly            | Oylik qo'ng'iroqlar     |
| GET    | /api/crm/daily              | Kunlik qo'ng'iroqlar    |
| GET    | /api/crm/telegram/kpi       | Telegram statistika     |
| GET    | /api/kpi                    | Umumiy KPI              |
| POST   | /api/sync                   | ETL trigger (admin)     |

---

## Data oqimi

```
AmoCRM API / calls_parser.py
        ↓
  automation/crm/crm_sync.py
        ↓
   MySQL: rnp_analytics
        ↓
 backend/src/services/*.js
        ↓
   /api/* REST endpoints
        ↓
 frontend polling (60s)
        ↓
    React Dashboard
```
