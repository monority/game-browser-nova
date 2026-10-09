# NOVA — Visual Direction

## 1. Target

NOVA should resemble a high-quality stylized 3D city maquette with a futuristic/cyberpunk-adjacent identity.

The desired balance is:

- dark but colorful;
- technological but readable;
- detailed but not noisy;
- dystopian atmosphere without visual misery;
- elegant and contemplative.

## 2. Age transformation

Age changes should be immediately visible in:

- architecture;
- roads;
- transport;
- lighting;
- industrial infrastructure;
- public spaces;
- vegetation;
- energy systems;
- density.

A player should recognize that civilization has advanced without opening a technology menu.

## 3. Buildings

Most buildings should remain within a coherent visual scale.

Large infrastructure can break the scale deliberately:

- nuclear/power plants;
- dams;
- major industrial complexes;
- major rail/transport structures.

Buildings should be readable by silhouette and function.

## 4. City composition

The visual system should reward:

- coherent districts;
- readable roads;
- sensible industrial separation;
- green corridors;
- public spaces;
- infrastructure hierarchy.

A well-optimized city should also have the potential to look beautiful.

## 5. Nature

Nature is mandatory content, not decoration.

Use:

- trees;
- parks;
- vegetation;
- water;
- natural areas;
- ecological restoration.

Green spaces should connect visually and can contribute to environmental simulation.

## 6. People and vehicles

Inhabitants, couriers and vehicles should be visible enough to make the city feel alive.

They are presentation of aggregate simulation where possible.

Individual visual agents must not become the canonical economic model in MVP.

## 7. Rendering priorities

Prioritize:

1. silhouette and readability;
2. lighting;
3. materials;
4. vegetation;
5. vehicles/inhabitants;
6. secondary decoration.

Do not trade simulation correctness for decorative geometry.

## 8. Performance

The target rendering stack is Three.js/WebGL2.

Use:

- instancing;
- LOD;
- culling;
- batching;

when profiling demonstrates a need.

Avoid premature rendering abstractions.
