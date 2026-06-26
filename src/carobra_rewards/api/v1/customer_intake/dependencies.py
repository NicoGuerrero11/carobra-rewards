"""FastAPI dependencies for customer intake routes."""

from carobra_rewards.infrastructure.database.session import get_session_factory
from carobra_rewards.modules.customer_intake.application.service import (
    ProcessSimulatedCustomerIntake,
)
from carobra_rewards.modules.customer_intake.infrastructure.persistence.repositories import (
    SqlAlchemyCustomerIntakeUnitOfWork,
)
from carobra_rewards.modules.customer_intake.infrastructure.rewards_id_generator import (
    TokenHexRewardsIdGenerator,
)


def get_process_customer_intake() -> ProcessSimulatedCustomerIntake:
    """Build the provisional functional service backed by real persistence."""

    return ProcessSimulatedCustomerIntake(
        unit_of_work=SqlAlchemyCustomerIntakeUnitOfWork(get_session_factory()),
        rewards_id_generator=TokenHexRewardsIdGenerator(),
    )
