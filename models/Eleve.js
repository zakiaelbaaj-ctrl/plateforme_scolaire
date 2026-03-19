import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize.js"; // ton instance Sequelize centralisée

/**
 * Modèle Eleve
 * Représente un étudiant inscrit dans la plateforme scolaire.
 * Conçu avec validations strictes et options de sécurité.
 */
const Eleve = sequelize.define(
  "Eleve",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    nom: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Le nom est obligatoire." },
        len: {
          args: [2, 100],
          msg: "Le nom doit contenir entre 2 et 100 caractères.",
        },
      },
    },

    prenom: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Le prénom est obligatoire." },
        len: {
          args: [2, 100],
          msg: "Le prénom doit contenir entre 2 et 100 caractères.",
        },
      },
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: {
        name: "unique_email",
        msg: "Cet email est déjà utilisé.",
      },
      validate: {
        isEmail: { msg: "Format d'email invalide." },
        notEmpty: { msg: "L'email est obligatoire." },
      },
    },

    heures: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: "Le nombre d'heures ne peut pas être négatif.",
        },
      },
    },
  },
  {
    tableName: "eleves", // nom explicite de la table
    timestamps: true, // ajoute createdAt et updatedAt
    underscored: true, // colonnes en snake_case (created_at, updated_at)
    paranoid: false, // pas de soft delete
    indexes: [
      {
        unique: true,
        fields: ["email"],
      },
    ],
    hooks: {
      beforeCreate: (eleve) => {
        eleve.nom = eleve.nom.trim();
        eleve.prenom = eleve.prenom.trim();
        eleve.email = eleve.email.toLowerCase().trim();
      },
      beforeUpdate: (eleve) => {
        if (eleve.changed("email")) {
          eleve.email = eleve.email.toLowerCase().trim();
        }
      },
    },
  }
);

export default Eleve;
