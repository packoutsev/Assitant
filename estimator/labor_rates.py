"""
Labor Rate Calculator for 1-800-Packouts

Calculates burdened labor costs and target billing rates to achieve
desired labor margins. Accounts for FICA, SUTA, FUTA, and Workers' Comp.

Usage:
    from labor_rates import LaborRateCalculator
    calc = LaborRateCalculator()
    rate = calc.billing_rate_for_margin(target_margin=0.65)
    # -> $79/hr per person to achieve 65% labor margin on a crew of 3
"""

from dataclasses import dataclass


@dataclass
class LaborBurden:
    """Employer tax and insurance burden rates."""
    fica: float = 0.0765       # Social Security (6.2%) + Medicare (1.45%)
    suta: float = 0.025        # State Unemployment Tax (AZ, varies by experience)
    futa: float = 0.006        # Federal Unemployment Tax
    workers_comp: float = 0.15  # Workers' Comp (~15% for movers/restoration in AZ)

    @property
    def total_burden_rate(self) -> float:
        return self.fica + self.suta + self.futa + self.workers_comp


@dataclass
class CrewConfig:
    """Crew composition and wage rates."""
    tech_wage: float = 21.00       # Hourly wage for techs
    supervisor_wage: float = 24.00  # Hourly wage for supervisor
    tech_count: int = 2            # Number of techs on crew
    supervisor_count: int = 1      # Number of supervisors on crew

    @property
    def crew_size(self) -> int:
        return self.tech_count + self.supervisor_count

    @property
    def total_hourly_wages(self) -> float:
        return (self.tech_wage * self.tech_count +
                self.supervisor_wage * self.supervisor_count)

    @property
    def blended_wage(self) -> float:
        """Average hourly wage across crew."""
        return self.total_hourly_wages / self.crew_size


class LaborRateCalculator:
    """Calculates burdened labor costs and billing rates."""

    def __init__(self, crew: CrewConfig = None, burden: LaborBurden = None):
        self.crew = crew or CrewConfig()
        self.burden = burden or LaborBurden()

    def burdened_cost_per_person(self, wage: float) -> float:
        """Burdened hourly cost for one employee."""
        return wage * (1 + self.burden.total_burden_rate)

    def burdened_tech_cost(self) -> float:
        return self.burdened_cost_per_person(self.crew.tech_wage)

    def burdened_supervisor_cost(self) -> float:
        return self.burdened_cost_per_person(self.crew.supervisor_wage)

    def burdened_crew_cost_per_hour(self) -> float:
        """Total burdened cost per wall-clock hour for the whole crew."""
        return (self.burdened_tech_cost() * self.crew.tech_count +
                self.burdened_supervisor_cost() * self.crew.supervisor_count)

    def blended_burdened_per_person(self) -> float:
        """Average burdened cost per person-hour."""
        return self.burdened_crew_cost_per_hour() / self.crew.crew_size

    def billing_rate_for_margin(self, target_margin: float = 0.65) -> float:
        """
        Calculate the billing rate per person-hour to achieve target labor margin.

        Margin = (Revenue - Cost) / Revenue
        Revenue = Cost / (1 - Margin)
        """
        cost = self.blended_burdened_per_person()
        return round(cost / (1 - target_margin), 2)

    def margin_at_rate(self, rate: float) -> float:
        """Calculate actual margin at a given billing rate."""
        cost = self.blended_burdened_per_person()
        if rate <= 0:
            return 0.0
        return (rate - cost) / rate

    def format_breakdown(self, target_margin: float = 0.65) -> str:
        """Format a detailed breakdown of the rate calculation."""
        lines = []
        lines.append("=" * 65)
        lines.append("LABOR RATE ANALYSIS")
        lines.append("=" * 65)
        lines.append("")

        # Crew composition
        lines.append(f"Crew: {self.crew.tech_count} techs @ ${self.crew.tech_wage:.2f}/hr"
                     f" + {self.crew.supervisor_count} supervisor @ ${self.crew.supervisor_wage:.2f}/hr")
        lines.append(f"Total crew: {self.crew.crew_size} | Base wages: ${self.crew.total_hourly_wages:.2f}/hr")
        lines.append("")

        # Burden breakdown
        lines.append("Employer Burden:")
        lines.append(f"  FICA (SS + Medicare):  {self.burden.fica*100:.2f}%")
        lines.append(f"  SUTA (AZ state):       {self.burden.suta*100:.2f}%")
        lines.append(f"  FUTA (federal):        {self.burden.futa*100:.2f}%")
        lines.append(f"  Workers' Comp:         {self.burden.workers_comp*100:.1f}%")
        lines.append(f"  Total burden:          {self.burden.total_burden_rate*100:.2f}%")
        lines.append("")

        # Per-person burdened costs
        lines.append("Burdened Hourly Cost:")
        lines.append(f"  Tech:       ${self.crew.tech_wage:.2f} x {1+self.burden.total_burden_rate:.4f}"
                     f" = ${self.burdened_tech_cost():.2f}/hr")
        lines.append(f"  Supervisor: ${self.crew.supervisor_wage:.2f} x {1+self.burden.total_burden_rate:.4f}"
                     f" = ${self.burdened_supervisor_cost():.2f}/hr")
        lines.append(f"  Crew total: ${self.burdened_crew_cost_per_hour():.2f}/hr"
                     f" ({self.crew.crew_size} people)")
        lines.append(f"  Blended:    ${self.blended_burdened_per_person():.2f}/hr per person")
        lines.append("")

        # Target rate
        target_rate = self.billing_rate_for_margin(target_margin)
        lines.append(f"Target margin: {target_margin*100:.0f}%")
        lines.append(f"Required billing rate: ${target_rate:.2f}/hr per person")
        lines.append("")

        # Comparison to standard rates
        lines.append("Rate Comparison:")
        xact_lab = 58.70
        xact_labs = 79.31
        diana_rate = 75.00
        lines.append(f"  Xactimate CPS LAB:  ${xact_lab:.2f}/hr -> {self.margin_at_rate(xact_lab)*100:.1f}% margin")
        lines.append(f"  Xactimate CPS LABS: ${xact_labs:.2f}/hr -> {self.margin_at_rate(xact_labs)*100:.1f}% margin")
        lines.append(f"  Diana's flat rate:  ${diana_rate:.2f}/hr -> {self.margin_at_rate(diana_rate)*100:.1f}% margin")
        lines.append(f"  Target rate:        ${target_rate:.2f}/hr -> {target_margin*100:.0f}% margin")

        return "\n".join(lines)


# Default calculator instance for convenience
DEFAULT_CALCULATOR = LaborRateCalculator()
DEFAULT_HANDLING_RATE = DEFAULT_CALCULATOR.billing_rate_for_margin(0.65)


if __name__ == '__main__':
    calc = LaborRateCalculator()
    print(calc.format_breakdown(target_margin=0.65))
