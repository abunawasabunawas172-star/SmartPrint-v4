import numpy as np
from sklearn.linear_model import LinearRegression
import joblib
import os

# 1. Data Latihan (Contoh: Jumlah Lembar vs Total Harga)
# X = Jumlah Lembar, y = Harga dalam Rupiah
X = np.array([[1], [10], [50], [100], [500], [1000]])
y = np.array([1000, 9500, 45000, 85000, 400000, 750000])

# 2. Buat Model AI
model = LinearRegression()
model.fit(X, y)

# 3. Simpan "Otak" AI ke folder models
if not os.path.exists('models'):
    os.makedirs('models')

joblib.dump(model, 'models/prediksi_harga.pkl')
print("Mantap Lek! Otak AI sudah tersimpan di models/prediksi_harga.pkl")