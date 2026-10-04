"use strict";

/**
 * Creates the users table.
 *
 * Written by hand rather than generated, so the down() migration is real and
 * the table can actually be rolled back.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
        allowNull: false,
      },
      name: { type: Sequelize.STRING, allowNull: true },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      passwordHash: { type: Sequelize.STRING, allowNull: false },
      deletionRequestedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // Logins look users up by email on every attempt.
    await queryInterface.addIndex("users", ["email"], {
      unique: true,
      name: "users_email_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
