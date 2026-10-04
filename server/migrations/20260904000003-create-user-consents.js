"use strict";

/**
 * Creates user_consents — an append-only record of what each user agreed to.
 *
 * Deliberately not a boolean on the users table: if a notice is reworded, an
 * old `true` would claim agreement to text the user never saw.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("user_consents", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      consentType: {
        type: Sequelize.ENUM("product_limitations", "privacy_notice", "data_import"),
        allowNull: false,
      },
      consentVersion: { type: Sequelize.STRING, allowNull: false },
      granted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      grantedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      withdrawnAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    await queryInterface.addIndex("user_consents", ["userId", "consentType"], {
      name: "user_consents_user_type_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_consents");
    // The ENUM type outlives the table in Postgres and must be dropped too,
    // or re-running the migration fails with "type already exists".
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_consents_consentType";');
  },
};
