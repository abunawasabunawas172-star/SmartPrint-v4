import os
import sqlite3
import datetime
import time
import sys
# import uuid # Not used, can be removed
import logging
import random
import hashlib
import json
import requests
from pathlib import Path
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file, abort, make_response
from werkzeug.utils import secure_filename
from flask import flash # Added flash import
from fpdf import FPDF

# ==============================================================================
# 0. ADVANCED SYSTEM CORE & SECURITY HEADERS
# ==============================================================================
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

app = Flask(__name__)
# Gunakan string kunci yang simpel tapi unik agar session cookie stabil di browser
app.secret_key = 'smartprint_key_2026_super_secure'
app.config.update(
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    PERMANENT_SESSION_LIFETIME=datetime.timedelta(hours=2)
)
app.config['SESSION_PERMANENT'] = True

# Konfigurasi Discord (Ganti dengan Webhook-mu lek)
DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1503779710864461984/EsTZYXtCMJ0IfiDUv6MjQyot1l_2ey1hYmrHBhKVJKcqBSyHKkda7abppPgfnPeCr9qt"

# Struktur Direktori Enterprise
BASE_DIR = Path(__file__).resolve().parent
STRUCTURE = {
    'db': BASE_DIR / 'database',
    'uploads': BASE_DIR / 'static/uploads/bukti',
    'invoices': BASE_DIR / 'static/outputs/invoices',
    'reports': BASE_DIR / 'static/outputs/reports',
    'logs': BASE_DIR / 'system_logs',
    'temp': BASE_DIR / 'temp'
}

for folder in STRUCTURE.values():
    folder.mkdir(parents=True, exist_ok=True)

# Advanced Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] SmartPrint-Core: %(message)s',
    handlers=[
        logging.FileHandler(STRUCTURE['logs'] / "production.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("SmartPrint")

# ==============================================================================
# 1. DATABASE ENGINE & AUTO-REPAIR
# ==============================================================================
DB_PATH = STRUCTURE['db'] / 'smartprint_v4_godmode.db'

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def boot_and_migrate():
    """Memastikan semua tabel database siap digunakan."""
    logger.info("Initializing Database Engine...")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Buat Tabel-tabel
        cur.execute('''CREATE TABLE IF NOT EXISTS tb_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id TEXT UNIQUE,
            cust_name TEXT,
            cust_wa TEXT,
            branch_name TEXT,
            doc_type TEXT,
            total_price INTEGER,
            payment_proof TEXT,
            status TEXT DEFAULT 'PENDING',
            queue_pos INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )''')

        cur.execute('''CREATE TABLE IF NOT EXISTS tb_branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            address TEXT,
            load_factor INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        )''')

        # 2. SEEDING DATA (Daftar cabang harus ada SEBELUM perintah executemany)
        # Pastikan variabel 'branches' didefinisikan di sini
        branches_data = [
            ('SmartPrint Margonda', 'Jl. Margonda Raya No. 10', 0),
            ('Mitra USU Medan', 'Jl. Universitas No. 1', 0),
            ('SmartPrint Jatinangor', 'Samping Unpad', 0),
            ('SmartPrint Malioboro', 'Yogyakarta', 0)
        ]
        
        # Masukkan data ke tabel
        cur.executemany("INSERT OR IGNORE INTO tb_branches (name, address, load_factor) VALUES (?,?,?)", branches_data)
        
        conn.commit()
        logger.info("Database Synchronized Successfully.")
    except sqlite3.Error as e:
        logger.error(f"Database migration failed: {e}")
    finally:
        if conn:
            conn.close()

boot_and_migrate()

# ==============================================================================
# 2. NOTIFICATION & PRICING ENGINE
# ==============================================================================
class SmartPrintEngine:
    @staticmethod
    def calculate_price(halaman, tipe):
        rate = 1200 if tipe == 'Warna' else 500
        total = halaman * rate
        if halaman > 100: total *= 0.9 
        return int(total)

    @staticmethod
    def generate_queue_number(branch_name):
        conn = None
        try:
            conn = get_db_connection()
            res = conn.execute("SELECT load_factor FROM tb_branches WHERE name=?", (branch_name,)).fetchone()
            return (res[0] + 1) if res else 1
        except sqlite3.Error as e:
            logger.error(f"Error generating queue number: {e}")
            return 1 # Default to 1 if DB error
        finally:
            if conn:
                conn.close()

def send_discord_notification(ctx, event_type="new"):
    if DISCORD_WEBHOOK_URL == "ISI_WEBHOOK_DISCORD_MU_DI_SINI": return
    title = "🆕 PESANAN BARU MASUK!" if event_type == "new" else "✅ BUKTI PEMBAYARAN DITERIMA!"
    color = 0x00ff00 if event_type == "new" else 0x38bdf8
    payload = {
        "embeds": [{
            "title": title,
            "color": color,
            "fields": [
                {"name": "Order ID", "value": f"`{ctx['id']}`", "inline": True},
                {"name": "Nama", "value": ctx['name'], "inline": True},
                {"name": "Cabang", "value": ctx['branch'], "inline": True},
                {"name": "Total", "value": f"Rp {ctx['total']}", "inline": True},
                {"name": "Antrian", "value": f"#{ctx['queue']}", "inline": True}
            ],
            "footer": {"text": "SmartPrint Engine v4.0"}
        }]
    }
    try: requests.post(DISCORD_WEBHOOK_URL, json=payload)
    except Exception as e: logger.error(f"Failed to send Discord notification: {e}")

# ==============================================================================
# 3. CORE WEB ROUTES
# ==============================================================================

@app.route('/')
@app.route('/index.html')
def index():
    conn = None
    branches = []
    try:
        conn = get_db_connection()
        branches = conn.execute("SELECT * FROM tb_branches WHERE is_active=1").fetchall()
    except sqlite3.Error as e:
        logger.error(f"Error fetching branches: {e}")
    finally:
        if conn:
            conn.close()
    # Variabel 'lokasi' untuk diproses {% for l in lokasi %} di HTML kamu
    return render_template('index.html', lokasi=branches)

@app.route('/initiate-checkout', methods=['POST'])
def start_checkout():
    try:
        nama = request.form.get('nama_pelanggan', 'Guest')
        wa = request.form.get('whatsapp', '0')
        total = request.form.get('total_bayar', '0')
        cabang = request.form.get('lokasi', 'Pusat') or request.form.get('lokasi_hidden', 'Pusat')
        doc_type = request.form.get('doc_type', 'umum')
        pages = request.form.get('pages', '1')
        copies = request.form.get('copies', '1')
        color = request.form.get('color_mode', 'color')
        side = request.form.get('side_mode', 'single')
        file_name = request.form.get('file_name_hidden', 'dokumen.pdf')

        logger.info(f"Initiating checkout for {nama} at {cabang} with total {total}")
        
        # Buat Context Order
        session['order_ctx'] = {
            'id': f"SP-{int(time.time())}-{random.randint(100,999)}",
            'name': nama,
            'wa': wa,
            'total': int(total),
            'branch': cabang,
            'doc_type': doc_type,
            'queue': SmartPrintEngine.generate_queue_number(cabang),
            'pages': pages,
            'copies': copies,
            'color': color,
            'side': side,
            'file_name': file_name
        }
        session.modified = True
        logger.info(f"Order context successfully created and stored in session: {session['order_ctx']}")
        
        # Kirim Notif ke Discord
        send_discord_notification(session['order_ctx'], "new")
        
        # PINDAH KE QRIS.HTML
        return redirect(url_for('payment_page'))

    except Exception as e:
        # Log critical errors with traceback
        logger.error(f"Critical error during checkout initiation: {e}", exc_info=True)
        flash(f'Terjadi kesalahan sistem saat memulai pembayaran: {e}', 'error')
        return redirect(url_for('index'))

@app.route('/qris.html')
def payment_page():
    if 'order_ctx' not in session:
        logger.warning("order_ctx not found in session, redirecting to index.")
        flash('Terjadi kesalahan. Data pesanan tidak ditemukan. Silakan coba lagi.', 'error')
        return redirect(url_for('index'))
    return render_template('qris.html', order=session['order_ctx'])

@app.route('/process-final', methods=['POST'])
def process_final():
    if 'order_ctx' not in session: return abort(403)
    ctx = session['order_ctx']
    file_bukti = request.files.get('bukti_pembayaran')
    
    filename = f"PROOF_{ctx['id']}.jpg"
    if file_bukti:
        try:
            file_bukti.save(str(STRUCTURE['uploads'] / filename))
        except Exception as e:
            logger.error(f"Error saving payment proof file: {e}")
            # Continue without file if save fails, or abort

    conn = None
    try:
        conn = get_db_connection()
        conn.execute('''INSERT INTO tb_orders
                     (order_id, cust_name, cust_wa, branch_name, doc_type, total_price, payment_proof, queue_pos)
                     VALUES (?,?,?,?,?,?,?,?)''',
                     (ctx['id'], ctx['name'], ctx['wa'], ctx['branch'], ctx['doc_type'], ctx['total'], filename, ctx['queue']))
        conn.execute("UPDATE tb_branches SET load_factor = load_factor + 1 WHERE name=?", (ctx['branch'],))
        conn.commit()
        
        # Kirim notif konfirmasi ke Discord
        send_discord_notification(ctx, "paid")
        
    except sqlite3.Error as e:
        logger.error(f"Error saving order to database: {e}")
        return "Database error during final processing", 500
    finally:
        if conn:
            conn.close()
    
    final_id = ctx['id']
    session.pop('order_ctx', None)
    return redirect(url_for('success_view', order_id=final_id))

@app.route('/success/<order_id>')
def success_view(order_id):
    return render_template('success.html', oid=order_id)

# ==============================================================================
# 4. REPORTING & ADMIN DASHBOARD
# ==============================================================================
@app.route('/api/generate-invoice/<oid>')
def generate_invoice(oid):
    conn = None
    order = None
    try:
        conn = get_db_connection()
        order = conn.execute("SELECT * FROM tb_orders WHERE order_id=?", (oid,)).fetchone()
    except sqlite3.Error as e:
        logger.error(f"Error fetching order for invoice: {e}")
        return "Database error", 500
    finally:
        if conn:
            conn.close()

    if not order: return abort(404)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", 'B', 16)
    pdf.cell(200, 10, txt="SMARTPRINT INVOICE", ln=True, align='C')
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, txt=f"Order ID: {order['order_id']}", ln=True)
    pdf.cell(200, 10, txt=f"Nama: {order['cust_name']}", ln=True)
    pdf.cell(200, 10, txt=f"Total: Rp {order['total_price']}", ln=True)

    path = STRUCTURE['invoices'] / f"INV_{oid}.pdf"
    pdf.output(str(path))
    return send_file(str(path), as_attachment=True)

@app.route('/internal/admin/dashboard')
def admin_dashboard():
    conn = None
    orders = []
    try:
        conn = get_db_connection()
        orders = conn.execute("SELECT * FROM tb_orders ORDER BY timestamp DESC").fetchall()
    except sqlite3.Error as e:
        logger.error(f"Error fetching orders for admin dashboard: {e}")
    finally:
        if conn:
            conn.close()
    return render_template('admin.html', orders=orders)


import numpy as np
from sklearn.linear_model import LinearRegression
import joblib

# Load the trained model
model = joblib.load('models/prediksi_harga.pkl')

@app.route('/hitung/<int:jumlah_lembar>')
def hitung_harga(jumlah_lembar):
    # Prediksi harga menggunakan model AI
    harga_prediksi = model.predict(np.array([[jumlah_lembar]]))
    
    # Format output
    return f"Harga prediksi untuk {jumlah_lembar} lembar adalah Rp {int(harga_prediksi[0])}"


if __name__ == '__main__':
    print("\n💎 SMARTPRINT GOD MODE v4.0 - ONLINE 🚀")
    app.run(debug=True, port=5000, host='0.0.0.0')