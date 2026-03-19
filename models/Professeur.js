import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize.js";

/**
 * Modèle Professeur
 * Représente un enseignant de la plateforme scolaire.
 * Conçu avec validations strictes, contraintes uniques et hooks de nettoyage.
 */
const Professeur = sequelize.define(
  "Professeur",
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
        name: "unique_prof_email",
        msg: "Cet email est déjà utilisé par un professeur.",
      },
      validate: {
        isEmail: { msg: "Format d'email invalide." },
        notEmpty: { msg: "L'email est obligatoire." },
      },
    },

    matiere: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "La matière enseignée est obligatoire." },
      },
    },

    heuresDisponibles: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: "Les heures disponibles ne peuvent pas être négatives.",
        },
      },
    },
  },
  {
    tableName: "professeurs",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      {
        unique: true,
        fields: ["email"],
      },
    ],
    hooks: {
      beforeCreate: (prof) => {
        prof.nom = prof.nom.trim();
        prof.prenom = prof.prenom.trim();
        prof.email = prof.email.toLowerCase().trim();
        prof.matiere = prof.matiere.trim();
      },
      beforeUpdate: (prof) => {
        if (prof.changed("email")) {
          prof.email = prof.email.toLowerCase().trim();
        }
      },
    },
  }
);

export default Professeur;
