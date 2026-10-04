"use strict";

/**
 * Creates wellness_check_ins.
 *
 * userId is NOT NULL with a foreign key and ON DELETE CASCADE. That pairing is
 * what makes two product rules true in the database rather than only in code:
 * every private record belongs to a user, and deleting an account really
 * removes their data.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("wellness_check_ins", {
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
      sleepQuality: { type: Sequelize.INTEGER, allowNull: false },
      stressLevel: { type: Sequelize.INTEGER, allowNull: false },
      mood: { type: Sequelize.INTEGER, allowNull: false },
      energy: { type: Sequelize.INTEGER, allowNull: false },
      focus: { type: Sequelize.INTEGER, allowNull: false },
      anxietyIntensity: { type: Sequelize.INTEGER, allowNull: true },
      studyHours: { type: Sequelize.DECIMAL(4, 1), allowNull: true },
      workHours: { type: Sequelize.DECIMAL(4, 1), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      snapshotScore: { type: Sequelize.INTEGER, allowNull: true },
      importChecksum: { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // The 1-10 bounds are enforced here too, not only by Sequelize validators.
    // A validator protects the app; a CHECK protects the data from anything
    // that writes to it, including a future script or a migration.
    await queryInterface.sequelize.query(`
      ALTER TABLE wellness_check_ins
        ADD CONSTRAINT wellness_signals_in_range CHECK (
          "sleepQuality" BETWEEN 1 AND 10 AND
          "stressLevel"  BETWEEN 1 AND 10 AND
          "mood"         BETWEEN 1 AND 10 AND
          "energy"       BETWEEN 1 AND 10 AND
          "focus"        BETWEEN 1 AND 10 AND
          ("anxietyIntensity" IS NULL OR "anxietyIntensity" BETWEEN 0 AND 10) AND
          ("snapshotScore"    IS NULL OR "snapshotScore"    BETWEEN 0 AND 100)
        );
    `);

    await queryInterface.addIndex("wellness_check_ins", ["userId", "createdAt"], {
      name: "wellness_check_ins_user_created_idx",
    });

    // Makes a repeated import impossible rather than merely unlikely.
    // Partial, so the many rows with a NULL checksum do not collide.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX wellness_check_ins_user_import_unique
        ON wellness_check_ins ("userId", "importChecksum")
        WHERE "importChecksum" IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("wellness_check_ins");
  },
};
