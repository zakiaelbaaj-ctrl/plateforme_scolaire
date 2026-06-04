import { DataTypes } from "sequelize";
import { sequelize } from "../config/index.js";
import bcrypt from "bcryptjs";

const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  username: { type: DataTypes.STRING(100), unique: true },
  prenom: { type: DataTypes.STRING(100) },
  nom: { type: DataTypes.STRING(100) },
  role: { 
    type: DataTypes.STRING(50), 
    defaultValue: "eleve" 
  },
  statut: { 
    type: DataTypes.STRING(50), 
    defaultValue: "pending" 
  },
  telephone: { type: DataTypes.STRING(20) },
  ville: { type: DataTypes.STRING(255) },
  pays: { type: DataTypes.STRING(255), defaultValue: "France"},
  matiere: { type: DataTypes.STRING(100) },
  tarif_horaire: { type: DataTypes.DECIMAL(10, 2) },
  price_per_minute: { type: DataTypes.DECIMAL(6, 2), defaultValue: 1.50 },
  balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  minutes_remaining: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_subscriber: { type: DataTypes.BOOLEAN, defaultValue: false },
  has_payment_method: { type: DataTypes.BOOLEAN, defaultValue: false },
  stripe_customer_id: { type: DataTypes.TEXT },
  stripe_account_id: { type: DataTypes.TEXT },
  date_inscription: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  resetToken: { type: DataTypes.STRING(255) },
  resetTokenExpires: { type: DataTypes.DATE }
}, {
  tableName: "users",
  timestamps: false, // Ta DB gère date_inscription manuellement
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed("password")) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Sécurité : Ne jamais renvoyer le password en JSON
// ✅ toJSON ne supprime PLUS le password (le service s'en charge)
User.prototype.toJSON = function () {
  const values = { ...this.get() };
  // On garde le password dans l'instance brute
  // sanitizeUser() dans le controller s'occupe de le retirer de la réponse API
  delete values.resetToken;
  return values;
};

export default User;
